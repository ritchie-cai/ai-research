#!/usr/bin/env python3
"""
Reorganize Chrome bookmarks HTML file.

Parse Netscape Bookmark format, apply reorganization mapping, output new HTML.
Keeps original ADD_DATE / ICON / attributes for every link.
"""

import html as htmllib
import re
import sys
from dataclasses import dataclass, field
from typing import Optional

SRC = "bookmarks_7_11_2026.html"
DST = "bookmarks_reorganized.html"


# --------------------------------------------------------------------------
# Tree model
# --------------------------------------------------------------------------

@dataclass
class Link:
    raw_line: str          # full original <DT><A ...>...</A> line, preserved verbatim
    href: str
    title: str

@dataclass
class Folder:
    name: str
    raw_header_line: str   # full original <DT><H3 ...>name</H3> line, preserved verbatim
    children: list = field(default_factory=list)  # list of Folder | Link

# --------------------------------------------------------------------------
# Parser  (line-based, preserves original attribute strings)
# --------------------------------------------------------------------------

H3_RE = re.compile(r'<DT>\s*<H3([^>]*)>(.*?)</H3>', re.IGNORECASE | re.DOTALL)
A_RE  = re.compile(r'<DT>\s*<A([^>]*)>(.*?)</A>', re.IGNORECASE | re.DOTALL)

def parse(lines):
    """Parse Netscape bookmark HTML lines into a list of top-level Folders."""
    n = len(lines)

    def parse_dl(start):
        """Parse contents of a <DL> block. `start` is the line AFTER <DL><p>.
        Returns (list_of_children, index_of_closing_</DL>_line)."""
        children = []
        i = start
        while i < n:
            raw_stripped = lines[i].strip()
            if raw_stripped.startswith('</DL>'):
                return children, i
            m = H3_RE.match(raw_stripped)
            if m:
                attrs = m.group(1)
                name = htmllib.unescape(m.group(2))
                # next non-empty stripped line should be <DL><p>
                j = i + 1
                while j < n and lines[j].strip() == '':
                    j += 1
                if j < n and lines[j].strip().lower().startswith('<dl>'):
                    sub_children, close_idx = parse_dl(j + 1)
                    folder = Folder(name=name,
                                    raw_header_line=lines[i].rstrip('\n'),
                                    children=sub_children)
                    children.append(folder)
                    i = close_idx + 1
                    continue
                else:
                    # H3 without a DL — treat as empty folder
                    folder = Folder(name=name,
                                    raw_header_line=lines[i].rstrip('\n'),
                                    children=[])
                    children.append(folder)
                    i += 1
                    continue
            m = A_RE.match(raw_stripped)
            if m:
                attrs = m.group(1)
                href_match = re.search(r'HREF="([^"]*)"', attrs)
                href = href_match.group(1) if href_match else ''
                title = m.group(2)
                children.append(Link(raw_line=lines[i].rstrip('\n'),
                                     href=href, title=title))
                i += 1
                continue
            # other lines (comments, <p>, blank) — skip
            i += 1
        return children, i

    # find first <DL> after <H1>Bookmarks</H1>
    top_start = None
    for idx, ln in enumerate(lines):
        if '<H1>' in ln:
            top_start = idx + 1
            break
    # find the first <DL> after that
    for idx in range(top_start, n):
        if lines[idx].strip().lower().startswith('<dl>'):
            top_dl_idx = idx
            break
    children, _ = parse_dl(top_dl_idx + 1)
    return children


# --------------------------------------------------------------------------
# Flatten helpers
# --------------------------------------------------------------------------

def collect_links(node, path, out):
    if isinstance(node, Link):
        out.append((path, node))
    else:  # Folder
        new_path = path + [node.name]
        for c in node.children:
            collect_links(c, new_path, out)

def count_links(node):
    if isinstance(node, Link):
        return 1
    return sum(count_links(c) for c in node.children)


# --------------------------------------------------------------------------
# Build new tree from a flat mapping:  new_path_tuple -> [Link, ...]
# --------------------------------------------------------------------------

def make_folder_header(name):
    ts = "1776591210"
    return f'<DT><H3 ADD_DATE="{ts}" LAST_MODIFIED="{ts}">{htmllib.escape(name)}</H3>'

def emit_link(line, out, depth):
    out.append('    ' * depth + line)

def emit_folder(folder_name, children_links, out, depth, header_line=None):
    """Emit a folder with a flat list of links (no sub-folders)."""
    if header_line is None:
        header_line = make_folder_header(folder_name)
    out.append('    ' * depth + header_line)
    out.append('    ' * depth + '<DL><p>')
    for ln in children_links:
        emit_link(ln, out, depth + 1)
    out.append('    ' * depth + '</DL><p>')

def emit_folder_with_subfolders(folder_name, subfolders, out, depth, extra_links=None, header_line=None):
    """subfolders: list of (sub_name, [links]) or (sub_name, subsubfolders, extra_links).
    For simplicity we accept a list of tuples (sub_name, items) where items is either
    list of link-lines or another list of (sub_name, items)."""
    if header_line is None:
        header_line = make_folder_header(folder_name)
    out.append('    ' * depth + header_line)
    out.append('    ' * depth + '<DL><p>')
    if extra_links:
        for ln in extra_links:
            emit_link(ln, out, depth + 1)
    for sub_name, items in subfolders:
        if items and isinstance(items[0], tuple) and len(items[0]) == 2 and isinstance(items[0][0], str):
            # nested subfolders
            emit_folder_with_subfolders(sub_name, items, out, depth + 1)
        else:
            # flat list of link lines
            emit_folder(sub_name, items, out, depth + 1)
    out.append('    ' * depth + '</DL><p>')


# --------------------------------------------------------------------------
# Reorganization logic
# --------------------------------------------------------------------------

def reorganize(top_children):
    """
    top_children: list of Folder (top-level, should contain "Bookmarks Bar").

    Returns: list of (folder_name, builder_fn) where builder_fn writes into `out` at depth.
    We build the new tree imperatively.
    """

    # The real categories live inside "Bookmarks Bar"
    bb = None
    for f in top_children:
        if f.name == "Bookmarks Bar":
            bb = f
            break
    if bb is None:
        print("[ERROR] No Bookmarks Bar folder found!", file=sys.stderr)
        sys.exit(1)

    # Index Bookmarks Bar's children by name
    by_name = {}
    for f in bb.children:
        if isinstance(f, Folder):
            by_name[f.name] = f

    # Collect *all* links with their original path so we can redistribute.
    all_links = []
    for f in top_children:
        collect_links(f, [], all_links)
    print(f"[parse] total links in source: {len(all_links)}")

    # Helper: collect raw link lines from a folder (recursively or one level).
    def links_of(folder, recursive=False):
        out = []
        def walk(node):
            if isinstance(node, Link):
                out.append(node.raw_line)
            elif recursive:
                for c in node.children:
                    walk(c)
        if recursive:
            for c in folder.children:
                walk(c)
        else:
            for c in folder.children:
                if isinstance(c, Link):
                    out.append(c.raw_line)
        return out

    def subfolder(folder, name):
        for c in folder.children:
            if isinstance(c, Folder) and c.name == name:
                return c
        return None

    # ----------------------------------------------------------------------
    # 1. OSSU  (微调)
    # ----------------------------------------------------------------------
    ossu = by_name.get("OSSU")
    ossu_sections = []
    changshi_folder = None  # will be moved to 生活, not OSSU
    if ossu:
        # Keep existing numbered course folders and study folders in order,
        # then add a "综合资源" folder for the loose links at the end.
        kept_subfolders = []
        loose_links = []
        for c in ossu.children:
            if isinstance(c, Folder):
                # 常识教育 will move to 生活, not stay in OSSU
                if c.name == "常识教育":
                    changshi_folder = c
                else:
                    kept_subfolders.append(c)
            else:
                loose_links.append(c.raw_line)
        # Build subfolder list of (name, links)
        ossu_sub = []
        for sf in kept_subfolders:
            # preserve its internal structure as-is (recursive)
            ossu_sub.append((sf.name, sf))
        ossu_sections.append(("OSSU", ossu_sub, loose_links))

    # ----------------------------------------------------------------------
    # 2. 信息聚合 (拆分重组)
    # ----------------------------------------------------------------------
    info = by_name.get("信息聚合")
    info_subfolders = []
    if info:
        # Original children: 海外账号, 平台账号, 集体智慧, 常识教育, + loose links (data sources)
        haiwai = subfolder(info, "海外账号")
        pingtai = subfolder(info, "平台账号")
        jiti = subfolder(info, "集体智慧")
        # 常识教育 might be under 信息聚合 or already under OSSU (from earlier parse)
        if changshi_folder is None:
            changshi_folder = subfolder(info, "常识教育")

        # Loose links inside 信息聚合 (FUTU, 雪球, Omdia, S&P, SEMI...) -> 信息源
        loose = [c.raw_line for c in info.children if isinstance(c, Link)]
        # Also collect loose links directly under Bookmarks Bar (WildCard, Allblue etc.)
        bb_loose = [c.raw_line for c in bb.children if isinstance(c, Link)]
        loose.extend(bb_loose)

        if haiwai:
            info_subfolders.append(("海外服务", haiwai))
        if pingtai:
            info_subfolders.append(("平台账号", pingtai))
        info_subfolders.append(("信息源", loose))
        if jiti:
            info_subfolders.append(("集体智慧", jiti))

    # ----------------------------------------------------------------------
    # 3. 行业专题 (flatten 物联网 + add AI行业)
    # ----------------------------------------------------------------------
    hangye = by_name.get("行业专题")
    hangye_subfolders = []
    if hangye:
        for c in hangye.children:
            if isinstance(c, Folder) and c.name == "物联网":
                # Flatten its 6 sub-subfolders into 3
                ind_insights = subfolder(c, "Industry Insights")
                biz_insights = subfolder(c, "Business Insights")
                acad = subfolder(c, "Academic & Research")
                hw = subfolder(c, "Hardware Enthusiasts")
                proto = subfolder(c, "通讯协议")
                chip = subfolder(c, "芯片制造")
                loose_iot = [x.raw_line for x in c.children if isinstance(x, Link)]

                def fold_links(*folders):
                    """Recursively collect all link raw_lines from given folders."""
                    out_l = []
                    for f in folders:
                        if f:
                            out_l.extend(links_of(f, recursive=True))
                    return out_l

                merged = [
                    ("行业资讯", fold_links(ind_insights, biz_insights)),
                    ("技术与学术", fold_links(acad, hw, proto) + loose_iot),
                ]
                if chip:
                    merged.append(("芯片制造", chip))
                hangye_subfolders.append(("物联网", merged))
            elif isinstance(c, Folder):
                hangye_subfolders.append((c.name, c))
            else:
                # loose link under 行业专题 — keep at end
                hangye_subfolders.append(("__loose__", [c.raw_line]))

    # Merge 信息聚合 subfolders into 行业专题
    if info_subfolders:
        hangye_subfolders.extend(info_subfolders)

    # ----------------------------------------------------------------------
    # 4. 技术专题 (按技术栈重新分组)
    # ----------------------------------------------------------------------
    tech = by_name.get("技术专题")
    tech_groups = []  # list of (group_name, subfolders_or_links)
    if tech:
        ai = subfolder(tech, "人工智能")
        se = subfolder(tech, "软件工程")
        os_sub = subfolder(tech, "操作系统")
        db = subfolder(tech, "数据库")
        arch = subfolder(tech, "软件架构")
        ops = subfolder(tech, "运维专题")
        lang = subfolder(tech, "编程语言")
        oss_soft = subfolder(tech, "开源软件")
        sec = subfolder(tech, "安全专题")
        test = subfolder(tech, "测试专题")
        net = subfolder(tech, "网络协议")
        hw_dev = subfolder(tech, "硬件开发")
        # loose links inside 技术专题 (GitHub Skills, 开源协议, 毕玄, 企微回调)
        tech_loose = [c.raw_line for c in tech.children if isinstance(c, Link)]

        # ---- Group A: AI与大模型 (技术部分) ----
        # Split AI: 大模型&框架 + ReAct动态规划 → 技术专题
        #           AI产商 + 文章&新闻 → 行业专题/人工智能
        ai_tech_subfolders = []
        ai_industry_links = []
        if ai:
            for c in ai.children:
                if isinstance(c, Folder) and c.name in ("AI产商", "文章&新闻"):
                    ai_industry_links.extend(links_of(c, recursive=True))
                elif isinstance(c, Folder):
                    ai_tech_subfolders.append((c.name, c))
                else:
                    # loose link under 人工智能 — keep with tech
                    ai_tech_subfolders.append(("__loose__", [c.raw_line]))
        if ai_tech_subfolders:
            # Filter out __loose__ entries and collect their links separately
            ai_tech_clean = []
            ai_tech_loose = []
            for sn, sc in ai_tech_subfolders:
                if sn == "__loose__":
                    ai_tech_loose.extend(sc)
                else:
                    ai_tech_clean.append((sn, sc))
            tech_groups.append(("AI与大模型", ai_tech_clean, ai_tech_loose))
        # Add AI行业 to 行业专题
        if ai_industry_links:
            hangye_subfolders.append(("人工智能", [("产商与资讯", ai_industry_links)]))

        # ---- Group B: Java生态 ----
        java_links = []
        if lang:
            java = subfolder(lang, "Java")
            if java:
                java_links.extend(links_of(java, recursive=True))
        # from 编程语言: 打包工具(Maven), 测试工具, 编程规范(JUnit/ArchUnit/Mockito etc.)
        if lang:
            pkg = subfolder(lang, "打包工具")
            if pkg:
                java_links.extend(links_of(pkg, recursive=True))
            tt = subfolder(lang, "测试工具")
            if tt:
                java_links.extend(links_of(tt, recursive=True))
            std = subfolder(lang, "编程规范")
            if std:
                java_links.extend(links_of(std, recursive=True))
        # from 开源软件: MyBatis, Velocity, Bytecode, Logging, threadlocal, Aviator, H2
        if oss_soft:
            for nm in ["MyBatis", "Velocity", "Bytecode", "Logging",
                       "threadlocal", "Aviator", "H2"]:
                sf = subfolder(oss_soft, nm)
                if sf:
                    java_links.extend(links_of(sf, recursive=True))
        # 虚拟机 (JVM/GC) from 编程语言/虚拟机
        if lang:
            vm = subfolder(lang, "虚拟机")
            if vm:
                java_links.extend(links_of(vm, recursive=True))
        # Java loose links inside 编程语言 (Java9 modules, GraalVM)
        if lang:
            for c in lang.children:
                if isinstance(c, Link):
                    java_links.append(c.raw_line)
        tech_groups.append(("Java生态", [("Java核心与工具", java_links)]))

        # ---- Group C: 数据与存储 ----
        ds_links = []
        if db:
            ds_links.extend(links_of(db, recursive=True))
        if oss_soft:
            for nm in ["DB", "Elastic Search", "HBase", "大数据", "缓存", "事务"]:
                sf = subfolder(oss_soft, nm)
                if sf:
                    ds_links.extend(links_of(sf, recursive=True))
        # loose links under 开源软件 (Apollo, db-engines, NoSQL, MongoDB, LevelDB, 布隆, HTTP client)
        if oss_soft:
            for c in oss_soft.children:
                if isinstance(c, Link):
                    ds_links.append(c.raw_line)
        tech_groups.append(("数据与存储", [("数据库与中间件", ds_links)]))

        # ---- Group D: 分布式与中间件 ----
        # Collect 区块链 and Reactive from 软件架构 FIRST, so they don't go to 软件工程
        dist_links = []
        bc_reactive_links = set()  # track raw_lines assigned to 分布式
        if oss_soft:
            for nm in ["Dubbo", "消息", "Zookeeper", "负载均衡", "CDN"]:
                sf = subfolder(oss_soft, nm)
                if sf:
                    for ln in links_of(sf, recursive=True):
                        dist_links.append(ln)
                        bc_reactive_links.add(ln)
        if arch:
            for nm in ["区块链", "Reactive"]:
                sf = subfolder(arch, nm)
                if sf:
                    for ln in links_of(sf, recursive=True):
                        dist_links.append(ln)
                        bc_reactive_links.add(ln)
        tech_groups.append(("分布式与中间件", [("中间件与分布式", dist_links)]))

        # ---- Group E: 软件工程与架构 ----
        # ALL links from 软件工程 + 软件架构 EXCEPT those already in 分布式
        sea_links = []
        if se:
            sea_links.extend(links_of(se, recursive=True))
        if arch:
            for ln in links_of(arch, recursive=True):
                if ln not in bc_reactive_links:
                    sea_links.append(ln)
        if lang:
            ver = subfolder(lang, "版本管理")
            if ver:
                sea_links.extend(links_of(ver, recursive=True))
        tech_groups.append(("软件工程与架构", [("工程方法与架构", sea_links)]))

        # ---- Group F: 运维与基础设施 ----
        ops_links = []
        if os_sub:
            ops_links.extend(links_of(os_sub, recursive=True))
        if ops:
            ops_links.extend(links_of(ops, recursive=True))
        if net:
            ops_links.extend(links_of(net, recursive=True))
        if hw_dev:
            ops_links.extend(links_of(hw_dev, recursive=True))
        if lang:
            sh = subfolder(lang, "Shell")
            if sh:
                ops_links.extend(links_of(sh, recursive=True))
        tech_groups.append(("运维与基础设施", [("系统/网络/容器/硬件", ops_links)]))

        # ---- Group G: 安全与测试 ----
        st_links = []
        if sec:
            st_links.extend(links_of(sec, recursive=True))
        if test:
            st_links.extend(links_of(test, recursive=True))
        tech_groups.append(("安全与测试", [("安全与测试", st_links)]))

        # tech_loose -> add as "综合" under 技术专题
        tech_groups.append(("综合", [("综合", tech_loose)]))

    # ----------------------------------------------------------------------
    # 5. 生活 (新建: 常识教育 + 管理专题/经验)
    # ----------------------------------------------------------------------
    life_subfolders = []
    if changshi_folder:
        life_subfolders.append(("通识教育", changshi_folder))
    # Move 经验 from 管理专题 into 生活
    mgmt = by_name.get("管理专题")
    if mgmt:
        jingyan = subfolder(mgmt, "经验")
        if jingyan:
            life_subfolders.append(("职场与成长", jingyan))

    # ----------------------------------------------------------------------
    # 6. Keep untouched: 管理专题(minus 经验), 实用, TUYA
    # ----------------------------------------------------------------------
    keep_folders = []
    if mgmt:
        # Remove 经验 from 管理专题's children
        mgmt_remaining = Folder(name=mgmt.name,
                                raw_header_line=mgmt.raw_header_line,
                                children=[c for c in mgmt.children
                                          if not (isinstance(c, Folder) and c.name == "经验")])
        keep_folders.append(("管理专题", mgmt_remaining))
    if "实用" in by_name:
        keep_folders.append(("实用", by_name["实用"]))
    if "TUYA" in by_name:
        keep_folders.append(("TUYA", by_name["TUYA"]))

    # ----------------------------------------------------------------------
    # Assemble output
    # ----------------------------------------------------------------------
    out = []
    out.append('<!DOCTYPE NETSCAPE-Bookmark-file-1>')
    out.append('<!-- This is an automatically generated file.')
    out.append('     It will be read and overwritten.')
    out.append('     DO NOT EDIT! -->')
    out.append('<META HTTP-EQUIV="Content-Type" CONTENT="text/html; charset=UTF-8">')
    out.append('<TITLE>Bookmarks</TITLE>')
    out.append('<H1>Bookmarks</H1>')
    out.append('<DL><p>')

    # Bookmarks Bar wrapper
    bb_header = '<DT><H3 ADD_DATE="1637499137" LAST_MODIFIED="1776591210" PERSONAL_TOOLBAR_FOLDER="true">Bookmarks Bar</H3>'
    out.append('    ' + bb_header)
    out.append('    <DL><p>')

    def emit_node(name, content, depth):
        """content can be:
           - Folder (preserved as-is, recursive; name used to override folder name if different)
           - list of (subname, subcontent) tuples
           - list of raw link lines (flat)
        """
        if isinstance(content, Folder):
            # Use provided name if it differs from the folder's original name
            if name and name != content.name:
                header = make_folder_header(name)
            else:
                header = content.raw_header_line.lstrip()
            out.append('    ' * depth + header)
            out.append('    ' * depth + '<DL><p>')
            for c in content.children:
                if isinstance(c, Folder):
                    emit_node(c.name, c, depth + 1)
                else:
                    emit_link(c.raw_line.lstrip(), out, depth + 1)
            out.append('    ' * depth + '</DL><p>')
        elif isinstance(content, list) and content and isinstance(content[0], tuple):
            # list of (subname, subcontent)
            out.append('    ' * depth + make_folder_header(name))
            out.append('    ' * depth + '<DL><p>')
            for subname, subcontent in content:
                emit_node(subname, subcontent, depth + 1)
            out.append('    ' * depth + '</DL><p>')
        elif isinstance(content, list):
            # flat list of link lines
            if name:
                out.append('    ' * depth + make_folder_header(name))
                out.append('    ' * depth + '<DL><p>')
                for ln in content:
                    emit_link(ln, out, depth + 1)
                out.append('    ' * depth + '</DL><p>')
            else:
                for ln in content:
                    emit_link(ln, out, depth)

    depth = 2  # inside Bookmarks Bar

    # 1. OSSU
    for name, subs, loose in ossu_sections:
        out.append('    ' * depth + make_folder_header(name))
        out.append('    ' * depth + '<DL><p>')
        for subname, subcontent in subs:
            emit_node(subname, subcontent, depth + 1)
        if loose:
            emit_node("综合资源", loose, depth + 1)
        out.append('    ' * depth + '</DL><p>')

    # 2. 行业专题 (含原信息聚合内容)
    if hangye_subfolders:
        out.append('    ' * depth + make_folder_header("行业专题"))
        out.append('    ' * depth + '<DL><p>')
        for subname, subcontent in hangye_subfolders:
            if subname == "__loose__":
                for ln in subcontent:
                    emit_link(ln, out, depth + 1)
            else:
                emit_node(subname, subcontent, depth + 1)
        out.append('    ' * depth + '</DL><p>')

    # 4. 技术专题
    if tech_groups:
        out.append('    ' * depth + make_folder_header("技术专题"))
        out.append('    ' * depth + '<DL><p>')
        for gitem in tech_groups:
            # gitem may be (name, content) or (name, content, loose_links)
            gname = gitem[0]
            gcontent = gitem[1]
            gloose = gitem[2] if len(gitem) > 2 else None
            out.append('    ' * (depth + 1) + make_folder_header(gname))
            out.append('    ' * (depth + 1) + '<DL><p>')
            if isinstance(gcontent, list) and gcontent and isinstance(gcontent[0], tuple):
                for subname, subcontent in gcontent:
                    emit_node(subname, subcontent, depth + 2)
            elif isinstance(gcontent, Folder):
                # emit folder's children directly
                for c in gcontent.children:
                    if isinstance(c, Folder):
                        emit_node(c.name, c, depth + 2)
                    else:
                        emit_link(c.raw_line.lstrip(), out, depth + 2)
            elif isinstance(gcontent, list):
                for ln in gcontent:
                    emit_link(ln, out, depth + 2)
            if gloose:
                for ln in gloose:
                    emit_link(ln, out, depth + 2)
            out.append('    ' * (depth + 1) + '</DL><p>')
        out.append('    ' * depth + '</DL><p>')

    # 5. 生活
    if life_subfolders:
        out.append('    ' * depth + make_folder_header("生活"))
        out.append('    ' * depth + '<DL><p>')
        for subname, subcontent in life_subfolders:
            emit_node(subname, subcontent, depth + 1)
        out.append('    ' * depth + '</DL><p>')

    # 6. Untouched folders
    for name, folder in keep_folders:
        emit_node(name, folder, depth)

    out.append('    </DL><p>')
    out.append('</DL><p>')

    return '\n'.join(out) + '\n', all_links


# --------------------------------------------------------------------------
# Main
# --------------------------------------------------------------------------

def main():
    with open(SRC, 'r', encoding='utf-8') as f:
        text = f.read()
    lines = text.split('\n')
    top = parse(lines)

    # Debug: print top-level structure
    for f in top:
        print(f"[top] {f.name}: {count_links(f)} links, {sum(1 for c in f.children if isinstance(c, Folder))} subfolders")

    output, all_links = reorganize(top)

    with open(DST, 'w', encoding='utf-8') as f:
        f.write(output)

    # Verify link count
    out_links = output.count('<A HREF')
    print(f"[verify] source links: {len(all_links)}, output <A HREF> count: {out_links}")
    if out_links != len(all_links):
        print("[WARN] link count mismatch!", file=sys.stderr)
        # find which hrefs are missing
        src_hrefs = set(l.href for _, l in all_links)
        # parse output hrefs
        out_hrefs = set(re.findall(r'HREF="([^"]*)"', output))
        missing = src_hrefs - out_hrefs
        extra = out_hrefs - src_hrefs
        if missing:
            print(f"  missing ({len(missing)}):")
            for h in list(missing)[:20]:
                print(f"    {h}")
        if extra:
            print(f"  extra ({len(extra)}):")
            for h in list(extra)[:20]:
                print(f"    {h}")
    else:
        print("[OK] link count matches.")


if __name__ == '__main__':
    main()
