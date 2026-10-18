# 灵思：直径不超过 1 英寸的小球硬件选型（第一轮）

日期：2026-10-18。性质：器件资料与几何预算核算，尚无结构 CAD、PCB、天线或运营商实测。截图只用于确认 1 英寸 = 25.4 mm；截图中的校准操作文字不属于产品要求。

## 已锁定的产品约束

- 装好可更换外壳后的**最大外径 ≤ 25.4 mm**；每次长按录音最长 5 分钟。
- 日常：独立录音、暂存、上传自有云，转写及整理在云端完成；国内用户通过微信小程序查看和编辑，不做独立 App。
- 活动：快速连按表达情绪或投票；装上带身份的外壳就领取主办方内容，取下后领取权益仍归账户。近场匹配与震动为可选后续能力。
- 核心内只有状态音；装饰外壳可以换材质或联名形象，但必须保留统一的收音口、按键行程、充电触点、射频窗口和 NFC 耦合区。
- 国内先做产品验证，欧美等市场同时做网络、法规和入口研究；海外数据也进入灵思自有云架构，部署区域另行设计。

## 结论先行

**选两条工程路线并行验证，不能直接承诺“一英寸、独立 4G Cat.1、五分钟录音、换壳 NFC 和实时演唱会互动”能全部同时量产。**

1. **严格 25.4 mm 的主路线：**[Nordic nRF9151](https://docs.nordicsemi.com/r/bundle/ps_nrf9151/page/nrf9151_html5_keyfeatures.html)（12.1 × 11.1 × 1.2 mm，集成 MCU、LTE-M / NB-IoT、PDM、SPI、PWM）+ PDM 麦克风 + 16 MB 外部 Flash + NFC 读头 + 可充电纽扣电池。国内走 **NB-IoT**，需实测五分钟语音上传耗时、移动和密集人群场景。[GSMA 商用网络表](https://www.gsma.com/solutions-and-impact/technologies/internet-of-things/mobile-iot-commercial-launches/)列出的中国三家运营商是 NB-IoT，未列中国大陆 LTE-M；具体城市、资费、开卡及器件入网仍须与运营商确认。
2. **独立 Cat.1 性能基线：**[移远 EC800M-CN](https://developer.quectel.com/wp-content/uploads/2024/09/Quectel_EC800M-CN_LTE_Standard_%E6%A8%A1%E5%9D%97%E4%BA%A7%E5%93%81%E8%A7%84%E6%A0%BC%E4%B9%A6_V1.2.pdf)（17.7 × 15.8 × 2.4 mm，最大上行 5 Mbps）。先在**较大工程样机**上验证音质、云端链路和运营商表现；不把它当作已能装进 25.4 mm 成品的方案。其供电设计要求最高 2 A、最大发射下峰值 1.5–2 A，微型电池也要另行证明可承受。[硬件设计手册](https://developer.quectel.com/wp-content/uploads/2024/09/Quectel_EC800M-CNEG810M-CN_QuecOpenQuecPython_%E7%A1%AC%E4%BB%B6%E8%AE%BE%E8%AE%A1%E6%89%8B%E5%86%8C_V1.3.pdf)
3. **极限 Cat.1 几何备选：**原 u-blox、现由 Trasna 承接的 [LEXI-R10](https://content.u-blox.com/sites/default/files/documents/LEXI-R10_ProductSummary_UBX-23003581.pdf) 是 16 × 16 × 2 mm，对角线约 22.63 mm，比上述假设净空 22.2 mm 仍大 0.43 mm。改变结构厚度或模组姿态或许能让封装几何通过，但 PCB、天线、电池、电源峰值仍未解决；[数据手册](https://content.u-blox.com/sites/default/files/documents/LEXI-R10_DataSheet_UBX-23007594.pdf)给出最高 900 mA 的失配天线条件平均发射电流口径。要请现供应商提供最新生命周期和中国入网资料。[Nordic nRF93M1](https://www.nordicsemi.com/Products/nRF93M1)虽然是 2026 年新 Cat.1 bis 候选，但封装同样为 15.8 × 17.7 × 2.4 mm，并且还需要外部主控，不改善这颗球的几何问题。

25.4 mm 成品中的蜂窝主路选择是**待实测的 NB-IoT 方案**，不是已确认可量产的最终 BOM。若独立高速上传或演唱会实时互动是硬约束，需要给外径、手机/场馆网关或通信架构留一个可变项。

## 尺寸与电源的硬约束

| 项目 | 第一轮预算或资料 | 影响 |
|---|---|---|
| 成品外径 | ≤ 25.4 mm，含外壳 | 量产验收应包括最厚联名外壳与装配公差。 |
| 暂定结构预算 | 外壳 1.0 mm/侧 + 核心壳 0.6 mm/侧，中心可用直径约 **22.2 mm**；这是设计假设 | 加强筋、卡扣、磁件、密封圈、天线间隙还会占空间，需 CAD 和剖面样件确认。 |
| EC800M-CN 封装 | 17.7 × 15.8 mm，平面对角线 **23.73 mm** | 仅封装对角线就大于 22.2 mm 的假设内径，还未算 PCB 与焊盘；不建议作为一英寸球的当前主方案。 |
| LEXI-R10 封装 | 16 × 16 mm，平面对角线 **22.63 mm** | 与假设净空仅差 0.43 mm，可留作高风险专项，但不能按“模组小于一英寸”判断整机可装配。 |
| nRF9151 封装 | 12.1 × 11.1 mm，对角线约 **16.42 mm** | 从几何上留有余量，但整机仍要放电池、天线、NFC 线圈、声学通道与触点。 |
| 纽扣锂电候选 | [VARTA CP1654 A4X](https://www.varta-ag.com/fileadmin/varta/industry/downloads/products/lithium-ion-cells/CoinPower_Folder_en_geschuetzt.pdf)：直径 16.1 mm、高 5.4 mm、145 mAh | 尺寸上可进入中心层；VARTA 给系列最大约 2C 放电口径，不能直接为 Cat.1 的 2 A 峰值供电。容量和瞬时电流均需整机实测。 |
| 音频量级 | 16 kHz / 16 bit / 单声道 PCM：5 分钟 **9.6 MB**；16–24 kbps 编码：约 **0.6–0.9 MB** | 本地必须压缩或用足够 Flash；编码器在目标 MCU 上的 CPU/RAM/音质尚未验证。 |
| NB-IoT 上传 | [GSMA 的 NB1 实际说明](https://www.gsma.com/solutions-and-impact/technologies/internet-of-things/gsma_resources/what-is-the-difference-in-data-throughput-between-lte-m-nb-iot-and-3g-or-4g/)给出峰值上行约 66 kbps，扩展覆盖区仅数 kbps；NB2 峰值可提高，但取决于网络 | 即便 0.6 MB 文件，在 66 kbps 下传输本身也至少约 **73 秒**，未含入网、TLS、重试及弱信号；不能承诺“录完即见”。 |

这张表的 **22.2 mm 是我们先放入结构评审的目标值**，不是已经验证的可用净空。电池与模组不能靠体积相加判断能否装入球体；每个刚性件都要校验所在高度处的球截面。

## 候选 BOM 与接口

| 功能 | 一英寸主路线候选 | 选型理由 / 待验证 |
|---|---|---|
| 主控 + 蜂窝 | [nRF9151](https://www.nordicsemi.com/Products/nRF9151) | 一颗 SiP 提供 LTE-M/NB-IoT 和 64 MHz Cortex-M33。国内用 NB-IoT；[Nordic 中国电信认证表](https://www.nordicsemi.com/Products/Wireless/Low-power-cellular-IoT/nRF91-Series-certifications/Mobile-network-operator)目前明确列的是 nRF9160，不能据此推定 nRF9151 已完成中国电信的运营商认证。必须询证并实测。 |
| 麦克风 | [Infineon IM72D128](https://www.infineon.com/part/IM72D128) PDM，4 × 3 × 1.2 mm，128 dB SPL AOP | 与主控 PDM 接口对应，高声压更适合做演唱会声学试验；器件高 AOP **不保证**用户说话在演唱会里可被正确转写。先做一颗麦克风与收音口试验。 |
| 暂存 | [Winbond W25Q128JV](https://www.winbond.com/export/sites/winbond/product-selection-guide/file/2025-Product-Selection-Guide-Winbond-Code-Storage-Flash-Memory.pdf)，128 Mbit = 16 MB，WSON 6 × 5 mm | 以 SPI 存加密音频分片、事件 ID 和上传状态；录音压缩格式与断电一致性需样机验证。云端确认后清除暂存，云端原声留存政策单独决定。 |
| 外壳身份 | 核心：[NXP PN7160](https://www.nxp.com/products/PN7160) NFC 读头，4 × 4 mm VFBGA；外壳：[NTAG 424 DNA](https://www.nxp.com/products/rfid-nfc/nfc-hf/ntag-for-tags-and-labels/ntag-424-dna-424-dna-tagtamper-advanced-security-and-privacy-for-trusted-iot-applications%3ANTAG424DNA) | 装壳事件触发短暂读卡，向自有云提交设备、外壳和账户的领取事件；服务端做幂等和授权。不能只信可复制的静态 UID。小线圈、不同材质和金属背衬必须实测。 |
| 装壳检测 | 壳上微型磁铁 + 核心低功耗霍尔开关，例如 [TI DRV5032](https://www.ti.com/product/drv5032) X2SON 封装 | 只在装壳变化时唤醒 NFC 验证，避免常开扫描耗电；磁铁与蜂窝/NFC 天线的相互影响仍需实测。亦可比较 PN7160 自带低功耗轮询。 |
| 电池与充电 | VARTA CP1654 A4X 或同级可充电微型电芯；充电 IC 可先试 [MCP73831](https://www.microchip.com/en-us/product/mcp73831)；两点磁吸/弹针充电底座 | 充电底座让壳体保持紧凑；最终电芯、保护电路、温度检测、充电电流和触点布局由电源试验定。不要默认无线充电线圈还能与蜂窝/NFC 共存。 |
| 状态音 | 压电发声器候选 [Murata PKMCS0909E4000-R1](https://www.murata.com/en-us/products/productdetail?partno=PKMCS0909E4000-R1)，9 × 9 × 1.9 mm，PWM 驱动 | **仅用于台架声学验证**：该型号已公布停产计划，正式设计需要重新选仍在供货的器件；声音能否穿透所有外壳也要测。可改小型动圈/骨传导，但成本和声腔另算。 |
| SIM | 运营商批准的 MFF2 焊接式 SIM/eSIM；[ST MFF2](https://www.st.com/en/secure-mcus/st4sim-200m.html)封装 5 × 6 mm 可作尺寸参考 | 具体方案取决于国内运营商物联卡、开户与远程配置条件。硬件支持 eSIM 不等于当地运营商同意该产品开通。 |
| 互动增配 | 如需场馆网关，评估 [nRF52811](https://www.nordicsemi.com/Products/nRF52811?lang=en) 蓝牙芯片（WLCSP 约 2.48 × 2.46 mm） | 芯片小，但还要 2.4 GHz 天线、匹配、功耗、场馆网关和运维。**首版不承诺在一英寸球内同时装好蜂窝、NFC 与 BLE。**近场匹配与震动继续保持可选。 |

**外壳机制：**核心收音口和按键位置固定，所有外壳按统一开孔/声学网/按键受力设计；把 NFC 标签放在固定耦合点。全金属壳必须留非金属射频和 NFC 窗口；[NXP 的天线指南](https://www.nxp.com/docs/en/application-note/AN13219.pdf)指出邻近金属会使 NFC 天线失谐，可能需要铁氧体隔离。每一种联名材质和厚度都要分别测蜂窝和 NFC，不应仅靠更换饰面样片放行。

## 设备流程与产品体验

1. 长按开始：播放短提示音，写入带唯一 ID 的本地加密录音片段；松开或到 5 分钟上限后播放完成音。
2. 网络可用时分片上传，服务端确认才删除本地片段。弱网下保留并重试；小程序显示“待同步 / 已同步 / 已转写 / 整理完成”。“录音完成”的本地声音**不能冒充云端已收到**。
3. 云端做 ASR 与 LLM 整理；人工编辑的分类和内容优先。原声在云端保留多久、是否允许长期存档需单独设定用户选项与存储策略。
4. 装上带 NFC 的外壳：核心检测装配变化并读标签，上传一次性领取事件；云端绑定到账户。换壳不撤销已领取内容，空白外壳也不阻断录音。
5. 按键语义固定：**长按始终录音**。只有设备已进入某场活动的有效时间窗口时，快速连按才映射到该活动的投票/情绪选项；其余时间给出“不在活动中”的提示音，避免误投。活动规则应提前缓存到本地，不能让每次按键依赖在线请求。
6. 活动快速连按：本地先记时间戳与事件 ID，再上传。若主办方要求秒级计票或实时反馈，应另做场馆 BLE 网关试验；不能以 NB-IoT 的实验室峰值速率推定场馆延迟。

## 一轮样机的通过门槛

先做不追求外观的功能样机，同时打样 25.4 mm 剖面模型。用同一批真实语音比较压缩方案在安静室内、通勤、演唱会环境的 ASR 错误；验证持续 5 分钟录音不中断且断电后可恢复。用国内至少两家运营商、室内/室外/人群密集三类点位记录入网、0.6–0.9 MB 文件上传成功率、P50/P95 时间、耗电与发热。对三种外壳材料分别测蜂窝天线效率、NFC 一次装壳读取率、麦克风堵孔、状态音可闻性。最后做最厚外壳的外径与跌落/拆装检查。

**路线决策：**若 NB-IoT 在目标场景的上传延迟和成功率可接受，就继续一英寸路线；若不达标，比较“放宽直径上 Cat.1”与“保持一英寸、用手机或场馆网关中转”的用户价值和成本。欧美调研用同一主控的 LTE-M 能力作为起点，但逐国核实运营商、频段、认证与数据部署；不把国外 LTE-M 可用性外推给国内。
