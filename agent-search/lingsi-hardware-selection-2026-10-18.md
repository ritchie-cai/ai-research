# 灵思：一英寸可换壳立方体硬件选型（第二轮）

日期：2026-10-18。性质：器件资料与几何预算核算，尚无结构 CAD、PCB、天线或运营商实测。用户将外形从球体改为立方体；暂按装上外壳后长、宽、高**各不超过 25.4 mm**评估。截图只用于确认 1 英寸 = 25.4 mm；截图中的校准操作文字不属于产品要求。

从采购开发板、做第一版 PCB 到试产的执行顺序见[硬件开发操作手册](lingsi-hardware-development-playbook-2026-10-18.md)。

## 已锁定的产品约束

- 装好可更换外壳后的**长、宽、高各 ≤ 25.4 mm**；建议采用大圆角立方体，单次长按录音最长 5 分钟。
- 日常：独立录音、暂存、上传自有云，转写及整理在云端完成；国内用户通过微信小程序查看和编辑，不做独立 App。
- 活动：快速连按表达情绪或投票；装上带身份的外壳就领取主办方内容，取下后领取权益仍归账户。近场匹配与震动为可选后续能力。
- 核心内只有状态音；装饰外壳可以换材质或联名形象，但必须保留统一的收音口、按键行程、充电触点、射频窗口和 NFC 耦合区。
- 国内先做产品验证，欧美等市场同时做网络、法规和入口研究；海外数据也进入灵思自有云架构，部署区域另行设计。

## 结论先行

**立方体让 Cat.1 从球体下的几何不适配，变成值得优先验证的整机路线。**25.4 mm 边长立方体的几何体积约 16.39 cm³，25.4 mm 直径球体约 8.58 cm³，前者约为后者 1.91 倍；这不等于实际可用电路空间。仍不能直接承诺“一英寸、独立 Cat.1、五分钟录音、换壳 NFC 和实时演唱会互动”能全部同时量产。

1. **国内主路线改为 Cat.1：**[移远 EC800M-CN](https://developer.quectel.com/wp-content/uploads/2024/09/Quectel_EC800M-CN_LTE_Standard_%E6%A8%A1%E5%9D%97%E4%BA%A7%E5%93%81%E8%A7%84%E6%A0%BC%E4%B9%A6_V1.2.pdf)（17.7 × 15.8 × 2.4 mm，最大上行 5 Mbps）自带应用开发能力和模拟麦克风接口；[QuecPython 录音 API](https://developer.quectel.com/doc/quecpython/API_reference/en/medialib/audio.Record.html)支持 EC800M-CN 的部分型号，但具体固件支持的编码格式需供应商确认。用它先做 25.4 mm 立方体堆叠板和较大功能板，二者同时测录音、云端上传和供电。其硬件手册要求外部电源有 2 A 供电能力，发射峰值 1.5–2 A；这是主要风险。[硬件设计手册](https://developer.quectel.com/wp-content/uploads/2024/09/Quectel_EC800M-CNEG810M-CN_QuecOpenQuecPython_%E7%A1%AC%E4%BB%B6%E8%AE%BE%E8%AE%A1%E6%89%8B%E5%86%8C_V1.3.pdf)
2. **更小的 Cat.1 备选：**原 u-blox、现由 Trasna 承接的 [LEXI-R10](https://content.u-blox.com/sites/default/files/documents/LEXI-R10_ProductSummary_UBX-23003581.pdf) 是 16 × 16 × 2 mm，在正方形净空中有更多平面余量，但需要外部主控与录音电路。[数据手册](https://content.u-blox.com/sites/default/files/documents/LEXI-R10_DataSheet_UBX-23007594.pdf)的发射电流数据仍高于常见微型纽扣电池能力；供应、认证与中国运营商接入需询证。[Nordic nRF93M1](https://www.nordicsemi.com/Products/nRF93M1)也可列入备选，但同样需外部主控。
3. **低功耗退路：**[Nordic nRF9151](https://docs.nordicsemi.com/r/bundle/ps_nrf9151/page/nrf9151_html5_keyfeatures.html)（12.1 × 11.1 × 1.2 mm）+ PDM 麦克风 + 16 MB Flash。国内拟走 NB-IoT；[GSMA 商用网络表](https://www.gsma.com/solutions-and-impact/technologies/internet-of-things/mobile-iot-commercial-launches/)列出的中国三家运营商是 NB-IoT，未列中国大陆 LTE-M。此路对小电池更友好，但五分钟音频上传延迟和活动现场的实时性要实测。

主路线是**Cat.1 可装入立方体平面截面的工程假设**，不是已确认可量产的 BOM。若电池、天线、温升或外壳认证不通过，再考虑 nRF9151/NB-IoT 或调整外形约束。

## 尺寸与电源的硬约束

| 项目 | 当前预算或资料 | 影响 |
|---|---|---|
| 成品外形 | 大圆角立方体，长、宽、高各 ≤ 25.4 mm，含外壳 | 量产验收应包括最厚联名外壳、装配公差与最大凸起；圆角半径也要进入结构图。 |
| 暂定结构预算 | 外壳 1.0 mm/侧 + 核心壳 0.6 mm/侧，中心可用正方形边长约 **22.2 mm**；这是设计假设 | 加强筋、卡扣、磁件、密封圈、天线间隙还会占空间，需 CAD、PCB 和实物剖面确认。 |
| EC800M-CN 封装 | 17.7 × 15.8 × 2.4 mm | 在 22.2 mm 正方形中，两个平面方向分别余 **4.5 / 6.4 mm**，已具备平面装入的可能；焊盘、走线、周边器件和高度堆叠待核算。 |
| LEXI-R10 封装 | 16 × 16 × 2 mm | 两个方向均余 **6.2 mm**；另需主控。 |
| nRF9151 封装 | 12.1 × 11.1 × 1.2 mm | 更宽松，适合作为 NB-IoT 退路。 |
| Cat.1 电池 | 不能直接沿用此前的纽扣电池；[VARTA CP1654 A4X](https://www.varta-ag.com/fileadmin/varta/industry/downloads/products/lithium-ion-cells/CoinPower_Folder_en_geschuetzt.pdf)仅 145 mAh，系列放电约 2C | EC800M-CN 需要按 2 A 电源能力做完整供电设计。应向供应商索取**可放进结构净空的高倍率软包电芯**数据，再测老化、低电量、低温和弱信号的电压跌落；当前没有合格定型电芯。 |
| 音频量级 | 16 kHz / 16 bit / 单声道 PCM：5 分钟 **9.6 MB**；16–24 kbps 编码：约 **0.6–0.9 MB** | 本地必须压缩或用足够 Flash；编码器在目标 MCU 上的 CPU/RAM/音质尚未验证。 |
| NB-IoT 上传 | [GSMA 的 NB1 实际说明](https://www.gsma.com/solutions-and-impact/technologies/internet-of-things/gsma_resources/what-is-the-difference-in-data-throughput-between-lte-m-nb-iot-and-3g-or-4g/)给出峰值上行约 66 kbps，扩展覆盖区仅数 kbps；NB2 峰值可提高，但取决于网络 | 即便 0.6 MB 文件，在 66 kbps 下传输本身也至少约 **73 秒**，未含入网、TLS、重试及弱信号；不能承诺“录完即见”。 |

这张表的 **22.2 mm 是我们先放入结构评审的目标值**，不是已经验证的可用净空。立方体能把平面截面留给矩形模组，但还需沿高度逐层排布电池、PCB、NFC 线圈、发声器、天线和充电触点。立方体比球体的体积大，也会显得更有棱角；建议保留圆角，但不能随意侵入模组所在的中心截面。

## 候选 BOM 与接口

| 功能 | 立方体 Cat.1 主路线候选 | 选型理由 / 待验证 |
|---|---|---|
| 主控 + 蜂窝 | [EC800M-CN](https://developer.quectel.com/en/modules-cat/ec800m-series) | Cat.1 + QuecOpen/QuecPython，优先跑通国内录音与上传；先确认项目允许的 Flash、SPI、NFC 驱动与录音编码。海外版本须按频段重新选型。 |
| 麦克风 | [Infineon IM70A135](https://www.infineon.com/part/IM70A135) 模拟差分 MEMS，3.5 × 2.65 × 0.98 mm、135 dB SPL AOP；按[EC800M 参考电路](https://developer.quectel.com/en/wp-content/uploads/sites/2/2024/11/Quectel_EC800M-CN_QuecOpen_Hardware_Design_V1.1.pdf)布置偏置和 ESD | 接口类型相符，电平、增益和噪声仍需实测；高 AOP 不能保证演唱会中语音可转写。此前的 [IM72D128](https://www.infineon.com/part/IM72D128) 是 **PDM 数字麦克风，只用于 nRF9151 备选路线**。 |
| 暂存 | [Winbond W25Q128JV](https://www.winbond.com/export/sites/winbond/product-selection-guide/file/2025-Product-Selection-Guide-Winbond-Code-Storage-Flash-Memory.pdf)，128 Mbit = 16 MB，WSON 6 × 5 mm | 以 SPI 存加密音频分片、事件 ID 和上传状态；录音压缩格式与断电一致性需样机验证。云端确认后清除暂存，云端原声留存政策单独决定。 |
| 外壳身份 | 核心：[NXP PN7160](https://www.nxp.com/products/PN7160) NFC 读头，4 × 4 mm VFBGA；外壳：[NTAG 424 DNA](https://www.nxp.com/products/rfid-nfc/nfc-hf/ntag-for-tags-and-labels/ntag-424-dna-424-dna-tagtamper-advanced-security-and-privacy-for-trusted-iot-applications%3ANTAG424DNA) | 装壳事件触发短暂读卡，向自有云提交设备、外壳和账户的领取事件；服务端做幂等和授权。不能只信可复制的静态 UID。小线圈、不同材质和金属背衬必须实测。 |
| 装壳检测 | 壳上微型磁铁 + 核心低功耗霍尔开关，例如 [TI DRV5032](https://www.ti.com/product/drv5032) X2SON 封装 | 只在装壳变化时唤醒 NFC 验证，避免常开扫描耗电；磁铁与蜂窝/NFC 天线的相互影响仍需实测。亦可比较 PN7160 自带低功耗轮询。 |
| 电池与充电 | 待定型的高倍率微型软包电芯、保护与低 ESR 储能电容；充电 IC 候选 [TI BQ25619](https://www.ti.com/product/BQ25619)；两点磁吸/弹针充电底座 | 先以 2 A 电源能力、3.4 V 最低模组电压做供电试验。充电 IC 的额定充电电流**不是**电池放电能力；不能用芯片参数替代电芯数据。保护、温度检测、触点布局由电源试验定。 |
| 状态音 | 压电发声器候选 [Murata PKMCS0909E4000-R1](https://www.murata.com/en-us/products/productdetail?partno=PKMCS0909E4000-R1)，9 × 9 × 1.9 mm，PWM 驱动 | **仅用于台架声学验证**：该型号已公布停产计划，正式设计需要重新选仍在供货的器件；声音能否穿透所有外壳也要测。可改小型动圈/骨传导，但成本和声腔另算。 |
| SIM | 运营商批准的 MFF2 焊接式 SIM/eSIM；[ST MFF2](https://www.st.com/en/secure-mcus/st4sim-200m.html)封装 5 × 6 mm 可作尺寸参考 | 具体方案取决于国内运营商物联卡、开户与远程配置条件。硬件支持 eSIM 不等于当地运营商同意该产品开通。 |
| 互动增配 | 如需场馆网关，评估 [nRF52811](https://www.nordicsemi.com/Products/nRF52811?lang=en) 蓝牙芯片（WLCSP 约 2.48 × 2.46 mm） | 立方体给了更好的平面布局，但还需 2.4 GHz 天线、匹配、功耗、场馆网关和运维。首版先验 Cat.1 + NFC；BLE、近场匹配与震动仍为可选项。 |

**外壳机制：**固定收音口、按键、充电触点、蜂窝天线窗口和 NFC 耦合区的相对位置；换壳只改变外观与非功能结构。全金属壳必须留非金属射频和 NFC 窗口；[NXP 的天线指南](https://www.nxp.com/docs/en/application-note/AN13219.pdf)指出邻近金属会使 NFC 天线失谐，可能需要铁氧体隔离。每一种联名材质和厚度都要分别测蜂窝和 NFC，不应仅靠更换饰面样片放行。

**建议六面分工（结构草案）：**顶面为可盲按的大按键；一侧为带声学网的麦克风口，避开手指压按位置；底面为充电触点；另两侧分别给蜂窝天线窗口和装壳 NFC 耦合区；余下面用于品牌图案与挂接件。所有联名外壳继承这些功能位置和最大尺寸。这样可在不拆外壳的情况下录音、充电和领取内容，具体面位仍由天线及声学样机调整。

## 设备流程与产品体验

1. 长按开始：播放短提示音，写入带唯一 ID 的本地加密录音片段；松开或到 5 分钟上限后播放完成音。
2. 网络可用时分片上传，服务端确认才删除本地片段。弱网下保留并重试；小程序显示“待同步 / 已同步 / 已转写 / 整理完成”。“录音完成”的本地声音**不能冒充云端已收到**。
3. 云端做 ASR 与 LLM 整理；人工编辑的分类和内容优先。原声在云端保留多久、是否允许长期存档需单独设定用户选项与存储策略。
4. 装上带 NFC 的外壳：核心检测装配变化并读标签，上传一次性领取事件；云端绑定到账户。换壳不撤销已领取内容，空白外壳也不阻断录音。
5. 按键语义固定：**长按始终录音**。只有设备已进入某场活动的有效时间窗口时，快速连按才映射到该活动的投票/情绪选项；其余时间给出“不在活动中”的提示音，避免误投。活动规则应提前缓存到本地，不能让每次按键依赖在线请求。
6. 活动快速连按：本地先记时间戳与事件 ID，再上传。若主办方要求秒级计票或实时反馈，应另做场馆 BLE 网关试验；不能以 NB-IoT 的实验室峰值速率推定场馆延迟。

## 一轮样机的通过门槛

先做不追求外观的 Cat.1 功能板，同时打样 25.4 mm 大圆角立方体堆叠模型。用同一批真实语音比较压缩方案在安静室内、通勤、演唱会环境的 ASR 错误；验证持续 5 分钟录音不中断且断电后可恢复。用国内至少两家运营商、室内/室外/人群密集三类点位记录入网、0.6–0.9 MB 文件上传成功率、P50/P95 时间、耗电与发热。供电测试单列：满电、低电、低温、老化模拟和弱信号时是否跌破 3.4 V、是否重启。对三种外壳材料分别测蜂窝天线效率、NFC 一次装壳读取率、麦克风堵孔、状态音可闻性。最后做最厚外壳的三轴尺寸与跌落/拆装检查。

**路线决策：**Cat.1 若通过装配、供电、天线和声学四项测试，就以立方体作为国内主形态；若供电或天线卡住，先评估较小 Cat.1 模组和定制电芯，再比较 NB-IoT、外形尺寸与网关方案的取舍。欧美同步研究当地 Cat.1/LTE-M 模组、运营商频段、认证与自有云部署，不能把中国版模组直接作为全球版。
