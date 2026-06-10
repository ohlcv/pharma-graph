// src/data/vocabulary.ts
// Discipline taxonomy for the brand carousel.
//
// Layer  → Discipline  → Terms
// 6 major layers with 10-20 terms each.

export interface Term {
  name: string;
  note?: string;
}

export interface DisciplineNode {
  id: string;
  label: string;
  parent: string | null;
  children?: DisciplineNode[];
  terms: Term[];
}

export interface DisciplineLayer {
  name: string;
  color?: string;
  disciplines: DisciplineNode[];
}

// ─── 词汇表 — 修改这里即可定制轮播内容 ───────────────────────────────────────
// 学科分类：形式科学 → 自然科学 → 工程与技术 → 生命科学 → 社会科学 → 人文与艺术
export const MESSAGES: DisciplineLayer[] = [

  // ═══════════════════════════════════════════════════════════════════
  // 1. 形式科学
  // ═══════════════════════════════════════════════════════════════════
  {
    name: '形式科学',
    disciplines: [
      {
        id: 'logic', label: '逻辑学', parent: null,
        terms: [
          { name: '形式系统' }, { name: '公理' }, { name: '定理' }, { name: '推理规则' },
          { name: '完备性' }, { name: '哥德尔不完备' }, { name: '可判定性' },
          { name: '皮亚诺算术' }, { name: '一阶逻辑' }, { name: '二阶逻辑' },
          { name: '模态逻辑' }, { name: '时态逻辑' }, { name: '直觉主义逻辑' },
          { name: '四论' }, { name: '对角线法' },
        ],
      },
      {
        id: 'math', label: '数学', parent: null,
        terms: [
          { name: '极限' }, { name: '连续' }, { name: '微分' }, { name: '积分' },
          { name: '可测性' }, { name: '紧致性' }, { name: '同构' }, { name: '同伦' },
          { name: '范畴论' }, { name: '拓扑' }, { name: '测度' }, { name: '函数空间' },
          { name: '非线性' }, { name: '分岔' }, { name: '混沌' },
          { name: '吸引子' }, { name: '分形' }, { name: '熵' },
        ],
      },
      {
        id: 'statistics', label: '统计学', parent: null,
        terms: [
          { name: '随机变量' }, { name: '概率分布' }, { name: '大数定律' },
          { name: '中心极限定理' }, { name: '贝叶斯推断' }, { name: '似然估计' },
          { name: '置信区间' }, { name: '假设检验' }, { name: 'p值' },
          { name: '多重比较校正' }, { name: '非参数检验' }, { name: 'Bootstrap' },
          { name: '因果推断' }, { name: '倾向得分匹配' }, { name: '工具变量' },
        ],
      },
      {
        id: 'infotheory', label: '信息论', parent: null,
        terms: [
          { name: '信息熵' }, { name: '互信息' }, { name: '信道容量' },
          { name: 'KL散度' }, { name: '交叉熵' }, { name: '香农编码' },
          { name: '霍夫曼编码' }, { name: '率失真理论' }, { name: '信息瓶颈' },
        ],
      },
      {
        id: 'probability', label: '概率论', parent: null,
        terms: [
          { name: '条件概率' }, { name: '贝叶斯定理' }, { name: '独立事件' },
          { name: '马尔可夫链' }, { name: '随机过程' }, { name: '布朗运动' },
          { name: '伊藤引理' }, { name: '随机微分方程' }, { name: '泊松过程' },
          { name: '过滤' }, { name: '鞅' }, { name: '稳态分布' },
          { name: '首达时' }, { name: '随机图' }, { name: '渗流' },
        ],
      },
    ],
  },

  // ═══════════════════════════════════════════════════════════════════
  // 2. 自然科学
  // ═══════════════════════════════════════════════════════════════════
  {
    name: '自然科学',
    disciplines: [
      {
        id: 'physics', label: '物理学', parent: null,
        terms: [
          { name: '波粒二象性' }, { name: '量子叠加' }, { name: '量子纠缠' },
          { name: '不确定性原理' }, { name: '波函数' }, { name: '薛定谔方程' },
          { name: '测量问题' }, { name: '退相干' }, { name: '量子隧穿' },
          { name: '量子场论' }, { name: '规范对称性' }, { name: '重整化' },
          { name: '相对论' }, { name: '时空' }, { name: '引力波' },
          { name: '熵增原理' }, { name: '热力学平衡' }, { name: '相变' },
        ],
      },
      {
        id: 'chemistry', label: '化学', parent: null,
        terms: [
          { name: '共价键' }, { name: '离子键' }, { name: '氢键' },
          { name: '范德华力' }, { name: '分子轨道' }, { name: '能带理论' },
          { name: '电子亲和能' }, { name: '电负性' }, { name: '杂化轨道' },
          { name: '亲核取代' }, { name: '亲电加成' }, { name: '消除反应' },
          { name: '氧化还原' }, { name: '催化' }, { name: '过渡态理论' },
          { name: '反应坐标' }, { name: '活化能' }, { name: '速率方程' },
          { name: '平衡常数' }, { name: '勒夏特列原理' },
        ],
      },
      {
        id: 'astronomy', label: '天文学', parent: null,
        terms: [
          { name: '红移' }, { name: '哈勃定律' }, { name: '宇宙学常数' },
          { name: '暗能量' }, { name: '暗物质' }, { name: '宇宙微波背景' },
          { name: '原初核合成' }, { name: '引力透镜' }, { name: '中子星' },
          { name: '黑洞' }, { name: '事件视界' }, { name: '霍金辐射' },
          { name: '类星体' }, { name: '星系' }, { name: '星系团' },
          { name: '大尺度结构' }, { name: '宇宙学模型' }, { name: '暴胀理论' },
        ],
      },
      {
        id: 'geoscience', label: '地球科学', parent: null,
        terms: [
          { name: '板块构造' }, { name: '俯冲带' }, { name: '地幔对流' },
          { name: '岩石圈' }, { name: '地壳均衡' }, { name: '地震波' },
          { name: '古地磁' }, { name: '地磁倒转' }, { name: '洋中脊' },
          { name: '海沟' }, { name: '地热梯度' }, { name: '温室效应' },
          { name: '碳循环' }, { name: '米兰科维奇周期' }, { name: '冰期' },
          { name: '沉积记录' }, { name: '同位素年代学' }, { name: '层序地层学' },
        ],
      },
      {
        id: 'biology', label: '生物学', parent: null,
        terms: [
          { name: 'DNA双螺旋' }, { name: '中心法则' }, { name: '基因表达' },
          { name: '蛋白质折叠' }, { name: '酶催化' }, { name: '代谢网络' },
          { name: '细胞信号传导' }, { name: 'G蛋白偶联受体' }, { name: '磷酸化级联' },
          { name: '细胞周期' }, { name: '有丝分裂' }, { name: '减数分裂' },
          { name: '程序性细胞死亡' }, { name: '自噬' }, { name: '细胞分化' },
          { name: '表观遗传' }, { name: '基因组印记' }, { name: '非编码RNA' },
          { name: '进化选择压力' }, { name: '中性漂变' },
        ],
      },
    ],
  },

  // ═══════════════════════════════════════════════════════════════════
  // 3. 工程与技术
  // ═══════════════════════════════════════════════════════════════════
  {
    name: '工程与技术',
    disciplines: [
      {
        id: 'ai', label: '人工智能', parent: null,
        terms: [
          { name: '神经网络' }, { name: '反向传播' }, { name: '梯度下降' },
          { name: '损失函数' }, { name: '正则化' }, { name: '过拟合' },
          { name: '卷积神经网络' }, { name: '循环神经网络' }, { name: '注意力机制' },
          { name: 'Transformer' }, { name: '自监督学习' }, { name: '对比学习' },
          { name: '强化学习' }, { name: '策略梯度' }, { name: 'Q学习' },
          { name: '迁移学习' }, { name: '多任务学习' }, { name: '元学习' },
        ],
      },
      {
        id: 'sweng', label: '软件工程', parent: null,
        terms: [
          { name: '抽象' }, { name: '封装' }, { name: '继承' },
          { name: '多态' }, { name: 'SOLID原则' }, { name: '设计模式' },
          { name: '微服务' }, { name: '容器化' }, { name: '持续集成' },
          { name: '测试驱动开发' }, { name: '代码重构' }, { name: '技术债务' },
          { name: '可扩展性' }, { name: '可用性' }, { name: '可维护性' },
        ],
      },
      {
        id: 'medeng', label: '医学工程', parent: null,
        terms: [
          { name: '医学影像' }, { name: 'CT' }, { name: 'MRI' },
          { name: 'PET' }, { name: '超声成像' }, { name: '光学相干断层扫描' },
          { name: '生物力学' }, { name: '有限元分析' }, { name: '假肢' },
          { name: '组织工程' }, { name: '生物材料' }, { name: '药物递送' },
          { name: '纳米医学' }, { name: '可穿戴设备' }, { name: '远程医疗' },
        ],
      },
      {
        id: 'chemicaleng', label: '化学工程', parent: null,
        terms: [
          { name: '反应器设计' }, { name: '单元操作' }, { name: '精馏' },
          { name: '萃取' }, { name: '干燥' }, { name: '结晶' },
          { name: '流体力学' }, { name: '传热' }, { name: '传质' },
          { name: '过程控制' }, { name: '优化调度' }, { name: '过程安全' },
          { name: '绿色化学' }, { name: '原子经济性' }, { name: '生命周期评估' },
        ],
      },
      {
        id: 'nucleareng', label: '核工程', parent: null,
        terms: [
          { name: '核裂变' }, { name: '核聚变' }, { name: '链式反应' },
          { name: '临界质量' }, { name: '反应堆物理' }, { name: '中子输运' },
          { name: '燃料循环' }, { name: '同位素分离' }, { name: '辐射防护' },
          { name: '剂量学' }, { name: '放射性衰变' }, { name: '半衰期' },
          { name: '核废料处理' }, { name: '聚变等离子体' }, { name: '托卡马克' },
        ],
      },
      {
        id: 'materialeng', label: '材料工程', parent: null,
        terms: [
          { name: '晶体结构' }, { name: '晶格缺陷' }, { name: '相图' },
          { name: '扩散' }, { name: '相变' }, { name: '时效硬化' },
          { name: '断裂力学' }, { name: '疲劳' }, { name: '腐蚀' },
          { name: '复合材料' }, { name: '纳米材料' }, { name: '智能材料' },
          { name: '生物相容性' }, { name: '柔性电子' }, { name: '能源材料' },
        ],
      },
    ],
  },

  // ═══════════════════════════════════════════════════════════════════
  // 4. 生命科学
  // ═══════════════════════════════════════════════════════════════════
  {
    name: '生命科学',
    disciplines: [
      {
        id: 'basicmed', label: '基础医学', parent: null,
        terms: [
          { name: '病理生理学' }, { name: '炎症' }, { name: '发热' },
          { name: '缺血-再灌注损伤' }, { name: '氧化应激' }, { name: '细胞凋亡' },
          { name: '坏死' }, { name: '自噬障碍' }, { name: '代偿' },
          { name: '失代偿' }, { name: '功能障碍' }, { name: '后遗症' },
          { name: '分子病理学' }, { name: '基因突变' }, { name: '染色体异常' },
          { name: '癌基因' }, { name: '抑癌基因' }, { name: '代谢紊乱' },
        ],
      },
      {
        id: 'clinicalmed', label: '临床医学', parent: null,
        terms: [
          { name: '循证医学' }, { name: '临床路径' }, { name: '诊疗指南' },
          { name: '鉴别诊断' }, { name: '辅助检查' }, { name: '影像诊断' },
          { name: '实验室检查' }, { name: '诊断特异性' }, { name: '诊断灵敏度' },
          { name: 'ROC曲线' }, { name: '预后因素' }, { name: '生存分析' },
          { name: 'Cox回归' }, { name: '倾向评分' }, { name: '亚组分析' },
          { name: '药物不良反应' }, { name: '药物警戒' }, { name: '药物流行病学' },
          { name: '个体化治疗' }, { name: '精准医学' },
        ],
      },
      {
        id: 'pharmacy', label: '药学', parent: null,
        terms: [
          { name: '药效学' }, { name: '药代动力学' }, { name: '首过效应' },
          { name: '生物利用度' }, { name: '表观分布容积' }, { name: '清除率' },
          { name: '半衰期' }, { name: '稳态血药浓度' }, { name: '非线性药代动力学' },
          { name: '药物-药物相互作用' }, { name: 'CYP酶' }, { name: 'P-gp外排泵' },
          { name: '药物基因组学' }, { name: '治疗药物监测' }, { name: '药物经济学' },
          { name: '处方分析' }, { name: '合理用药' }, { name: '抗菌药物管理' },
          { name: '耐药机制' }, { name: '抗菌药物后效应' },
          { name: '抗生素杀菌/抑菌' }, { name: '联合药敏' }, { name: 'MIC' },
          { name: 'PK/PD参数' }, { name: 'T>MIC' }, { name: 'AUC/MIC' },
          { name: 'Cmax/MIC' }, { name: '浓度依赖性' }, { name: '时间依赖性' },
        ],
      },
      {
        id: 'agriculture', label: '农学', parent: null,
        terms: [
          { name: '光合作用' }, { name: 'C3途径' }, { name: 'C4途径' },
          { name: 'CAM光合' }, { name: '蒸腾作用' }, { name: '水分利用效率' },
          { name: '根系吸收' }, { name: '养分胁迫' }, { name: '固氮' },
          { name: '植物激素' }, { name: '生长素' }, { name: '赤霉素' },
          { name: '细胞分裂素' }, { name: '脱落酸' }, { name: '乙烯' },
          { name: '抗逆性' }, { name: '耐旱' }, { name: '耐盐' },
          { name: '抗虫转基因' }, { name: '基因编辑' }, { name: '分子育种' },
        ],
      },
    ],
  },

  // ═══════════════════════════════════════════════════════════════════
  // 5. 社会科学
  // ═══════════════════════════════════════════════════════════════════
  {
    name: '社会科学',
    disciplines: [
      {
        id: 'economics', label: '经济学', parent: null,
        terms: [
          { name: '供给需求' }, { name: '均衡价格' }, { name: '弹性' },
          { name: '边际效用' }, { name: '机会成本' }, { name: '沉没成本' },
          { name: '外部性' }, { name: '公共物品' }, { name: '市场失灵' },
          { name: '博弈论' }, { name: '纳什均衡' }, { name: '囚徒困境' },
          { name: '逆向选择' }, { name: '道德风险' }, { name: '委托代理问题' },
          { name: '信息不对称' }, { name: '柠檬市场' }, { name: '行为经济学' },
          { name: '前景理论' }, { name: '锚定效应' },
        ],
      },
      {
        id: 'finance', label: '金融学', parent: null,
        terms: [
          { name: '有效市场假说' }, { name: 'CAPM' }, { name: 'APT' },
          { name: '阿尔法' }, { name: '贝塔' }, { name: '夏普比率' },
          { name: '无风险利率' }, { name: '风险溢价' }, { name: '久期' },
          { name: '凸性' }, { name: '免疫策略' }, { name: '期权定价' },
          { name: 'Black-Scholes' }, { name: '希腊字母' }, { name: '波动率微笑' },
          { name: '信用风险' }, { name: '违约概率' }, { name: '在险价值' },
          { name: '流动性风险' }, { name: '系统性风险' },
        ],
      },
      {
        id: 'management', label: '管理学', parent: null,
        terms: [
          { name: '战略分析' }, { name: 'SWOT' }, { name: '波特五力' },
          { name: '价值链分析' }, { name: '商业模式画布' }, { name: '蓝海战略' },
          { name: '核心竞争力' }, { name: '动态能力' }, { name: '组织变革' },
          { name: '领导力' }, { name: '权变理论' }, { name: '情境领导' },
          { name: '目标管理' }, { name: 'OKR' }, { name: '平衡计分卡' },
          { name: '精益生产' }, { name: '六西格玛' }, { name: 'TOC约束理论' },
        ],
      },
      {
        id: 'psychology', label: '心理学', parent: null,
        terms: [
          { name: '认知失调' }, { name: '锚定效应' }, { name: '可得性启发' },
          { name: '代表性启发' }, { name: '过度自信偏差' }, { name: '确认偏差' },
          { name: '损失厌恶' }, { name: '禀赋效应' }, { name: '框架效应' },
          { name: '峰终定律' }, { name: '心流状态' }, { name: '自我效能感' },
          { name: '习得性无助' }, { name: '操作性条件反射' }, { name: '消退' },
          { name: '社会学习理论' }, { name: '观察学习' }, { name: '元认知' },
          { name: '执行功能' }, { name: '工作记忆' },
        ],
      },
      {
        id: 'sociology', label: '社会学', parent: null,
        terms: [
          { name: '社会结构' }, { name: '社会分层' }, { name: '社会流动' },
          { name: '社会资本' }, { name: '制度' }, { name: '社会网络' },
          { name: '嵌入性' }, { name: '弱关系假设' }, { name: '结构洞' },
          { name: '社会认同' }, { name: '群体极化' }, { name: '从众效应' },
          { name: '社会影响' }, { name: '规范' }, { name: '越轨行为' },
          { name: '社会控制' }, { name: '社会运动' }, { name: '集体行动' },
        ],
      },
      {
        id: 'anthropology', label: '人类学', parent: null,
        terms: [
          { name: '田野调查' }, { name: '民族志' }, { name: '文化相对主义' },
          { name: '文化整体论' }, { name: 'emic视角' }, { name: 'etic视角' },
          { name: '亲属制度' }, { name: '图腾崇拜' }, { name: '象征人类学' },
          { name: '结构主义' }, { name: '后结构主义' }, { name: '实践理论' },
          { name: '身体人类学' }, { name: '认知人类学' }, { name: '语言人类学' },
        ],
      },
      {
        id: 'law', label: '法学', parent: null,
        terms: [
          { name: '成文法' }, { name: '判例法' }, { name: '法律渊源' },
          { name: '法律解释' }, { name: '文义解释' }, { name: '目的解释' },
          { name: '体系解释' }, { name: '权利能力' }, { name: '行为能力' },
          { name: '法律行为' }, { name: '意思表示' }, { name: '代理' },
          { name: '物权法定' }, { name: '一物一权' }, { name: '公示公信原则' },
          { name: '债权相对性' }, { name: '无因管理' }, { name: '不当得利' },
          { name: '侵权责任' }, { name: '过错责任' }, { name: '无过错责任' },
        ],
      },
      {
        id: 'education', label: '教育学', parent: null,
        terms: [
          { name: '建构主义' }, { name: '最近发展区' }, { name: '支架式教学' },
          { name: '发现学习' }, { name: '有意义学习' }, { name: '认知负荷理论' },
          { name: '内化' }, { name: '外化' }, { name: '自我调节学习' },
          { name: '成长型思维' }, { name: '刻意练习' }, { name: '元认知策略' },
          { name: '形成性评价' }, { name: '终结性评价' }, { name: '档案袋评价' },
          { name: '翻转课堂' }, { name: '混合学习' }, { name: '项目式学习' },
        ],
      },
    ],
  },

  // ═══════════════════════════════════════════════════════════════════
  // 6. 人文与艺术
  // ═══════════════════════════════════════════════════════════════════
  {
    name: '人文与艺术',
    disciplines: [
      {
        id: 'philosophy', label: '哲学', parent: null,
        terms: [
          { name: '本体论' }, { name: '认识论' }, { name: '形而上学' },
          { name: '唯名论' }, { name: '唯实论' }, { name: '怀疑论' },
          { name: '先验论' }, { name: '经验论' }, { name: '理性主义' },
          { name: '现象学' }, { name: '存在主义' }, { name: '结构主义' },
          { name: '解构主义' }, { name: '实用主义' }, { name: '分析哲学' },
          { name: '语言转向' }, { name: '心脑同一论' }, { name: '功能主义' },
          { name: '取消式唯物主义' }, { name: '涌现论' },
        ],
      },
      {
        id: 'history', label: '历史学', parent: null,
        terms: [
          { name: '史料批判' }, { name: '一手史料' }, { name: '二手史料' },
          { name: '历史解释' }, { name: '历史叙事' }, { name: '年鉴学派' },
          { name: '长时段' }, { name: '结构' }, { name: '态势' }, { name: '事件' },
          { name: '史料的能动性' }, { name: '口述史' }, { name: '计量史' },
          { name: '历史地理学' }, { name: '比较史' }, { name: '全球史' },
          { name: '环境史' }, { name: '社会史' }, { name: '思想史' },
        ],
      },
      {
        id: 'buddhism', label: '佛学', parent: null,
        terms: [
          { name: '四谛' }, { name: '苦' }, { name: '无常' }, { name: '空' },
          { name: '无我' }, { name: '十二缘起' }, { name: '业' },
          { name: '轮回' }, { name: '涅槃' }, { name: '八正道' },
          { name: '四念处' }, { name: '止观' }, { name: '奢摩他' },
          { name: '毗婆舍那' }, { name: '四禅八定' }, { name: '三十七道品' },
          { name: '五蕴' }, { name: '八识' }, { name: '阿赖耶识' },
          { name: '法相唯识' }, { name: '中观' }, { name: '二谛' },
          { name: '空性' }, { name: '缘起性空' },
        ],
      },
      {
        id: 'yogacara', label: '瑜伽行派', parent: null,
        terms: [
          { name: '万法唯识' }, { name: '识转变' }, { name: '种子说' },
          { name: '三类境' }, { name: '相见二分' }, { name: '自证分' },
          { name: '四分' }, { name: '阿赖耶识缘起' }, { name: '转识成智' },
          { name: '分别论者' }, { name: '法相' }, { name: '五位百法' },
          { name: '心所相应' }, { name: '遍行' }, { name: '别境' },
          { name: '善' }, { name: '烦恼' }, { name: '随烦恼' }, { name: '不定' },
          { name: '瑜伽师地论' }, { name: '成唯识论' }, { name: '显扬圣教论' },
        ],
      },
      {
        id: 'pureland', label: '净土宗', parent: null,
        terms: [
          { name: '阿弥陀佛' }, { name: '西方极乐世界' }, { name: '十八愿' },
          { name: '十九愿' }, { name: '二十愿' }, { name: '本愿' },
          { name: '他力本愿' }, { name: '信心念佛' }, { name: '称名念佛' },
          { name: '观想念佛' }, { name: '实相念佛' }, { name: '正定聚' },
          { name: '邪定聚' }, { name: '不定聚' }, { name: '三辈往生' },
          { name: '九品往生' }, { name: '凡夫入报' }, { name: '易行道' },
          { name: '难行道' }, { name: '善导' }, { name: '昙鸾' },
          { name: '道绰' }, { name: '法相' }, { name: '难易二道' },
        ],
      },
      {
        id: 'daoism', label: '道家', parent: null,
        terms: [
          { name: '道' }, { name: '德' }, { name: '无为' },
          { name: '自然' }, { name: '逍遥' }, { name: '齐物' },
          { name: '坐忘' }, { name: '心斋' }, { name: '朝彻' },
          { name: '见独' }, { name: '天籁' }, { name: '地籁' },
          { name: '人籁' }, { name: '阴阳' }, { name: '五行' },
          { name: '气' }, { name: '精' }, { name: '神' },
          { name: '性命双修' }, { name: '内丹' }, { name: '外丹' },
          { name: '道法自然' }, { name: '返璞归真' },
        ],
      },
      {
        id: 'linguistics', label: '语言学', parent: null,
        terms: [
          { name: '音位' }, { name: '音素' }, { name: '同化' },
          { name: '异化' }, { name: '省略' }, { name: '增添' },
          { name: '替换' }, { name: '形态学' }, { name: '词素' },
          { name: '语素' }, { name: '句法' }, { name: '依存语法' },
          { name: '成分结构语法' }, { name: '语义' }, { name: '语用' },
          { name: '语料库语言学' }, { name: '计算语言学' }, { name: '神经语言学' },
        ],
      },
      {
        id: 'journalism', label: '新闻传播学', parent: null,
        terms: [
          { name: '把关人理论' }, { name: '议程设置' }, { name: '框架理论' },
          { name: '沉默的螺旋' }, { name: '两级传播' }, { name: '创新扩散' },
          { name: '使用与满足' }, { name: '培养理论' }, { name: '知识鸿沟' },
          { name: '媒介依赖' }, { name: '媒介偏见' }, { name: '媒介融合' },
          { name: '数据新闻' }, { name: '计算传播学' }, { name: '社交机器人' },
          { name: '后真相' }, { name: '信息茧房' }, { name: '回音室效应' },
        ],
      },
    ],
  },

  // ═══════════════════════════════════════════════════════════════════
  // 7. 交叉学科
  // ═══════════════════════════════════════════════════════════════════
  {
    name: '交叉学科',
    disciplines: [
      {
        id: 'cognitivesci', label: '认知科学', parent: null,
        terms: [
          { name: '计算认知' }, { name: '认知架构' }, { name: 'ACT-R' },
          { name: '联结主义' }, { name: '符号系统' }, { name: '双重编码' },
          { name: '工作记忆模型' }, { name: '情境认知' }, { name: '具身认知' },
          { name: '涌现认知' }, { name: '意识难问题' }, { name: '全局工作空间理论' },
          { name: '整合信息理论' }, { name: '预测编码' }, { name: '自由能原理' },
          { name: '主动推理' }, { name: '贝叶斯大脑' }, { name: '神经表征' },
          { name: '认知控制' }, { name: '元认知' },
        ],
      },
      {
        id: 'bioinfomatics', label: '生物信息学', parent: null,
        terms: [
          { name: '序列比对' }, { name: 'BLAST' }, { name: 'Smith-Waterman' },
          { name: 'Needleman-Wunsch' }, { name: '空位罚分' }, { name: '打分矩阵' },
          { name: '同源建模' }, { name: '蛋白质结构预测' }, { name: 'AlphaFold' },
          { name: '分子对接' }, { name: '虚拟筛选' }, { name: '药效团建模' },
          { name: 'ADMET预测' }, { name: '系统生物学' }, { name: '代谢网络建模' },
          { name: '基因调控网络' }, { name: '蛋白质互作网络' }, { name: '通路富集分析' },
          { name: 'GSEA' }, { name: 'WGCNA' }, { name: '单细胞测序' },
          { name: '多组学整合' }, { name: '精准医疗' },
        ],
      },
      {
        id: 'econophysics', label: '经济物理学', parent: null,
        terms: [
          { name: '幂律分布' }, { name: '标度不变性' }, { name: '临界现象' },
          { name: '自组织临界' }, { name: 'Ising模型' }, { name: '渗流模型' },
          { name: '价格冲击传播' }, { name: '流动性' }, { name: '市场微观结构' },
          { name: '订单簿' }, { name: '价量动力学' }, { name: 'Hurst指数' },
          { name: '长程相关性' }, { name: '波动率聚类' }, { name: 'ARCH效应' },
          { name: '相关性矩阵去噪' }, { name: '最小生成树' }, { name: '资产配置' },
        ],
      },
      {
        id: 'psycolinguistics', label: '心理语言学', parent: null,
        terms: [
          { name: '词汇通达' }, { name: '激活扩散模型' }, { name: '浊音启动' },
          { name: '非词效应' }, { name: '句法预测' }, { name: '花园路径效应' },
          { name: '整合负担' }, { name: '情境模型' }, { name: '指代消解' },
          { name: '话语理解' }, { name: '工作记忆容量' }, { name: '阅读眼动' },
          { name: 'E-Z读者模型' }, { name: 'SWOW模型' }, { name: '语料库实验' },
        ],
      },
      {
        id: 'complexnetworks', label: '复杂网络', parent: null,
        terms: [
          { name: '小世界网络' }, { name: '无标度网络' }, { name: '度分布' },
          { name: '聚类系数' }, { name: '平均路径长度' }, { name: '介数中心性' },
          { name: '接近中心性' }, { name: '特征向量中心性' }, { name: 'PageRank' },
          { name: '社团检测' }, { name: '模块度优化' }, { name: '谱方法' },
          { name: '渗流相变' }, { name: '鲁棒性' }, { name: '级联失效' },
          { name: '网络可控性' }, { name: '网络同步' }, { name: '多层网络' },
        ],
      },
      {
        id: 'climate', label: '气候科学', parent: null,
        terms: [
          { name: '辐射强迫' }, { name: '温室效应' }, { name: '气候敏感度' },
          { name: '反馈机制' }, { name: '水汽反馈' }, { name: '冰- albedo反馈' },
          { name: '云反馈' }, { name: 'ENSO' }, { name: '太平洋年代际振荡' },
          { name: 'AMOC' }, { name: '热盐环流' }, { name: '岁差' },
          { name: '倾角' }, { name: '偏心率' }, { name: '冰期-间冰期旋回' },
          { name: '气候临界点' }, { name: ' tipping elements' }, { name: '碳预算' },
          { name: 'RCP情景' }, { name: 'SSP情景' }, { name: '气候预估不确定性' },
        ],
      },
      {
        id: 'neuroeconomics', label: '神经经济学', parent: null,
        terms: [
          { name: '奖励预测误差' }, { name: '多巴胺信号' }, { name: '时间折扣' },
          { name: '眶额皮层' }, { name: '前额叶' }, { name: '伏隔核' },
          { name: '风险决策' }, { name: '损失厌恶' }, { name: '框架效应神经' },
          { name: '社会决策' }, { name: '信任博弈' }, { name: '最后通牒博弈' },
          { name: '理性选择神经基础' }, { name: '自由意志神经基础' }, { name: '成瘾神经机制' },
          { name: '认知控制' }, { name: '元认知神经机制' },
        ],
      },
    ],
  },
];
