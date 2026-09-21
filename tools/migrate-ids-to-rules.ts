#!/usr/bin/env node
/**
 * ID 迁移脚本
 * 标准格式: 前缀-英文名-书简写-章号-节号
 * 药一结构: Book/篇/章，篇级=ch-，章级=sec-
 */
import fs from 'node:fs';
import path from 'node:path';
import { glob } from 'glob';
import { parse as yamlParse } from 'yaml';

const CONTENT_DIR = 'public/content';

const BOOK_MAP = { '药学专业知识一': 'y1', '药学专业知识二': 'y2', '药学综合知识与技能': 'y3', '药事管理与法规': 'y4' };

const LABEL_EN = {
  // 药二章级
  '精神与中枢神经系统用药': 'cns',
  '解热、镇痛、抗炎、抗风湿及抗痛风药': 'analgesic',
  '呼吸系统用药': 'respiratory', '消化系统用药': 'gi',
  '心血管系统用药': 'cv', '血液系统用药': 'hematology',
  '内分泌系统用药': 'endocrine', '泌尿系统用药': 'urology',
  '抗感染药物': 'antiinfective', '抗肿瘤药': 'oncology',
  '调节水、电解质、酸碱平衡与营养用药': 'fluid-nutrition',
  '眼科用药、耳鼻咽喉科用药及口腔科用药': 'sensory',
  '皮肤用药及抗过敏用药': 'dermatology',
  // 药一 篇级
  '药剂学': 'pharmaceutics', '药理与毒理学': 'pharmacology',
  '药物化学': 'medicinal-chem', '药动学': 'pkpd',
  '生命药学': 'biopharmacy',
  // 药三章级
  '药学服务与药品管理': 'pharmacy-service', '处方审核与调剂': 'prescription',
  '用药咨询与药物治疗管理': 'dtm', '慢性病管理': 'chronic',
  '常见病症的健康管理': 'common-condition', '急救、中毒解救及职业防护': 'emergency',
  '用药安全': 'drug-safety', '呼吸系统常见疾病': 'respiratory-disease',
  '心血管系统常见疾病': 'cv-disease', '消化系统常见疾病': 'gi-disease',
  '神经精神系统常见疾病': 'neuro-psych', '内分泌系统常见疾病': 'endocrine-disease',
  '泌尿系统常见疾病': 'urinary-disease', '免疫系统常见疾病': 'immune-disease',
  '肿瘤': 'oncology-disease',
  // 药二节级
  '第一节 解热、镇痛、抗炎药': 'nsaid', '第二节 抗风湿药': 'antirheumatic',
  '第三节 抗痛风药': 'antigout',
  '第一节 镇静催眠药、中枢肌松药': 'sedative-hypnotic',
  '第二节 抗癫痫发作药物': 'antiepileptic', '第三节 抗抑郁药': 'antidepressant',
  '第四节 抗记忆障碍及改善神经功能药': 'nootropic',
  '第五节 中枢镇痛药': 'central-analgesic', '第六节 抗帕金森病药': 'antiparkinson',
  '第七节 抗精神病药': 'antipsychotic',
  '第一节 镇咳药': 'antitussive', '第二节 祛痰药': 'expectorant',
  '第三节 平喘药': 'antiasthmatic', '第四节 特发性肺纤维化的治疗药物': 'ipf-drug',
  '第一节 利尿药': 'diuretic', '第二节 治疗男性勃起功能障碍药': 'ed-drug',
  '第三节 治疗良性前列腺增生用药': 'bph-drug',
  '第四节 治疗膀胱过度活动症用药': 'oab-drug',
  '第一节 抗心律失常药': 'antiarrhythmic', '第二节 抗高血压药': 'antihypertensive',
  '第三节 调节血脂药': 'lipid-regulator', '第四节 抗心绞痛药': 'antianginal',
  '第五节 抗心力衰竭药': 'antihf',
  '第一节 抗血栓药': 'antithrombotic', '第二节 抗出血药': 'hemostatic',
  '第三节 抗贫血药': 'antianemic', '第四节 升白细胞药': 'leukocyte-stim',
  '第五节 骨髓保护药': 'bone-marrow-protect',
  '第一节 下丘脑-垂体激素及相关药物': 'pituitary-hormone',
  '第二节 肾上腺糖皮质激素类药物': 'gcs',
  '第三节 甲状腺激素类药物与抗甲状腺药物': 'thyroid-drug',
  '第四节 胰岛素与其他影响血糖的药物': 'glucose-drug',
  '第五节 调节骨代谢药物': 'bone-metabolism', '第六节 减重药': 'weight-drug',
  '第七节 性激素类': 'sex-hormone',
  '第一节 抑酸剂、抗酸药与胃黏膜保护药': 'acid-suppressant',
  '第二节 解痉药、胃肠动力药与功能性胃肠病治疗药': 'gi-motility',
  '第三节 止吐药': 'antiemetic', '第四节 肝胆疾病用药': 'hepatobiliary',
  '第五节 泻药与便秘治疗药': 'laxative',
  '第六节 止泻药、肠道抗感染药、肠道抗炎药': 'antidiarrheal',
  '第七节 助消化药': 'digestive-aid',
  '第一节 抗菌药物总论': 'antibio-overview',
  '第二节 青霉素类抗菌药物': 'penicillin',
  '第三节 头孢菌素类抗菌药物': 'cephalosporin',
  '第四节 β-内酰胺酶抑制剂、碳青霉烯类与其他β-内酰胺类抗菌药物': 'beta-lactam',
  '第五节 氨基糖苷类与四环素类抗菌药物': 'aminoglycoside-tc',
  '第六节 大环内酯类、林可霉素类与酰胺醇类抗菌药物': 'macrolide-lincosamide',
  '第七节 喹诺酮类与磺胺类抗菌药物': 'fq-sulfa',
  '第八节 硝基呋喃类与硝基咪唑类抗菌药物': 'nitrofuran-nitroimidazole',
  '第九节 糖肽类与其他抗菌药物': 'glycopeptide-other',
  '第十节 抗结核分枝杆菌药': 'antitubercular',
  '第十一节 抗真菌药': 'antifungal',
  '第十二节 抗（人）疱疹病毒药物': 'anti-herpesvirus',
  '第十三节 抗流感病毒药': 'anti-influenza',
  '第十四节 抗新型冠状病毒药': 'anti-covid',
  '第十五节 抗肝炎病毒药物': 'anti-hepatitis',
  '第十六节 抗艾滋病病毒药物': 'anti-hiv',
  '第十七节 抗原虫药和抗蠕虫药': 'antiprotozoal',
  '第一节 直接影响DNA结构和功能的药物': 'dna-drug',
  '第二节 干扰核酸生物合成的药物（抗代谢药）': 'antimetabolite',
  '第三节 干扰转录过程和阻止RNA合成的药物（作用于核酸转录药物）': 'rna-drug',
  '第四节 干扰有丝分裂的药物': 'mitosis-drug',
  '第五节 调节体内激素平衡的药物': 'hormone-therapy',
  '第六节 生物靶向治疗药物': 'bio-targeted',
  '第七节 其他抗肿瘤药物': 'other-onco',
  '第一节 糖类、盐类、酸碱平衡调节药': 'fluid-electrolyte',
  '第二节 微量元素与维生素': 'micro-vitamin',
  '第三节 肠内营养药': 'enteral-nutrition',
  '第四节 肠外营养药': 'parenteral-nutrition',
  '第一节 眼科用药': 'ophthalmic', '第二节 耳鼻咽喉科用药': 'ent-drug',
  '第三节 口腔科用药': 'dental-drug',
  '第一节 体外杀寄生虫与皮肤感染治疗药': 'skin-parasite',
  '第二节 局部用抗真菌药': 'topical-antifungal',
  '第三节 痤疮治疗药': 'acne-drug', '第四节 外用糖皮质激素': 'topical-gcs',
  '第五节 治疗白癜风药': 'vitiligo-drug', '第六节 治疗银屑病药': 'psoriasis-drug',
  '第七节 妇科外用药': 'gyne-drug', '第八节 消毒防腐药': 'antiseptic',
  '第九节 抗过敏药': 'antiallergic',
  // 药一章级（实际是章，在篇下）
  '药物与药品质量体系': 'drug-quality', '口服制剂与临床应用': 'oral-dosage',
  '注射剂与临床应用': 'injection', '皮肤和黏膜给药途径制剂与临床应用': 'topical-mucosal',
  '药物的结构与作用': 'drug-structure', '药物对机体的作用': 'drug-effect',
  '药物毒性与用药安全': 'drug-toxicity', '药物的体内过程': 'adme',
  '生命药学': 'biopharmacy-ch',
  // 药三节级
  '第一节 药学服务与执业药师': 'pharmacy-care', '第二节 药品管理': 'drug-mgmt',
  '第一节 处方审核': 'rx-review', '第二节 调剂操作': 'dispensing',
  '第一节 药学信息咨询服务': 'drug-info', '第二节 疾病管理与健康宣教': 'disease-mgmt',
  '第三节 药物治疗管理': 'mtm', '第四节 常用医学检查': 'lab-exam',
  '第一节 发热与疼痛': 'fever-pain', '第二节 呼吸系统问题': 'respiratory-issue',
  '第三节 消化系统问题': 'gi-issue', '第四节 泌尿生殖系统问题': 'gu-issue',
  '第五节 皮肤及黏膜系统问题': 'skin-issue', '第六节 眼睛问题': 'eye-issue',
  '第七节 其他病症': 'other-issue',
  '第一节 急救的意义与原则': 'emergency-principle',
  '第二节 常见急症及处置': 'emergency-condition', '第三节 中毒解救': 'toxicology',
  '第一节 药物警戒': 'pv', '第二节 药品不良反应': 'adr',
  '第三节 药源性疾病': 'did', '第四节 用药错误': 'med-error',
  '第五节 特殊人群用药': 'special-population', '第六节 免疫抑制患者用药': 'immuno-patient',
  '第一节 哮喘': 'asthma', '第二节 慢性阻塞性肺疾病': 'copd',
  '第一节 高血压': 'hypertension', '第二节 血脂异常': 'dyslipidemia',
  '第三节 冠状动脉粥样硬化性心脏病': 'cad', '第四节 心房颤动': 'afib',
  '第一节 胃食管反流病': 'gerd', '第二节 消化性溃疡': 'pud',
  '第三节 溃疡性结肠炎': 'uc', '第四节 慢性病毒性肝炎': 'chronic-hepatitis',
  '第一节 焦虑抑郁': 'anxiety-depression', '第二节 失眠症': 'insomnia',
  '第三节 脑卒中': 'stroke', '第四节 帕金森病': 'parkinson',
  '第五节 癫痫': 'epilepsy', '第六节 痴呆': 'dementia',
  '第一节 甲状腺功能亢进症': 'hyperthyroidism', '第二节 甲状腺功能减退症': 'hypothyroidism',
  '第三节 糖尿病': 'diabetes', '第四节 骨质疏松症': 'osteoporosis',
  '第五节 高尿酸血症与痛风': 'gout',
  '第一节 良性前列腺增生症': 'bph', '第二节 慢性肾脏病': 'ckd',
  '第一节 类风湿关节炎': 'ra', '第二节 系统性红斑狼疮': 'sle',
  '第一节 肿瘤的临床基础': 'oncology-basics',
  '第二节 肿瘤的治疗与预防': 'oncology-treatment',
  '第三节 肿瘤化疗管理': 'chemo-mgmt',
  '第四节 肿瘤靶向治疗管理': 'targeted-therapy',
  '第五节 肿瘤支持治疗管理': 'supportive-care',
  // 抗风湿药分组/分类
  'JAK抑制剂（枸橼酸托法替布、巴瑞替尼）': 'jak-inhibitor',
  'TNF‑α抑制剂（依那西普、阿达木单抗、英夫利昔单抗）': 'tnf-alpha-inhibitor',
  'IL‑17抑制剂（司库奇尤单抗、依奇珠单抗）': 'il17-inhibitor',
  'IL-1拮抗剂': 'il1-antagonist', 'IL-6拮抗剂': 'il6-antagonist',
  '改善病情的抗风湿药(DMARDs)': 'dmards',
  '传统合成改善病情的抗风湿药': 'csdmards',
  '生物制剂及靶向改善病情的抗风湿药': 'biodmards',
  '免疫抑制剂-DMARDs': 'immuno-dmard',
  '蛋白质类药（重组XX、XX单抗）特点总结': 'biotech-summary',
};

const DRUG_EN = {
  '丁苯酞': 'butylphthalide', '倍他司汀': 'betahistine', '利斯的明': 'rivastigmine',
  '加兰他敏': 'galantamine', '多奈哌齐': 'donepezil', '石杉碱甲': 'huperzine-a',
  '吡拉西坦': 'piracetam', '奥拉西坦': 'oxiracetam', '茴拉西坦': 'aniracetam',
  '尼麦角林': 'nicergoline', '胞磷胆碱钠': 'citicoline', '脑蛋白水解物': 'cerebroprotein',
  '艾地苯醌': 'idebenone', '银杏叶提取物': 'ginkgo', '神经节苷脂': 'ganglioside',
  '鼠神经生长因子': 'mNGF', '维生素B1': 'vitamin-b1', '维生素B12': 'vitamin-b12',
  '维生素B6': 'vitamin-b6', '叶酸': 'folic-acid', '硫辛酸': 'lipoic-acid',
  'B族维生素及其衍生物': 'b-vitamins', '酰胺类中枢兴奋药': 'amide-nootropic',
  '乙酰胆碱酯酶抑制剂': 'achei', '其他改善神经功能类药': 'nerve-function',
  '其他改善脑功能药': 'other-brain',
  '阿达木单抗': 'adalimumab', '英夫利昔单抗': 'infliximab', '依那西普': 'etanercept',
  '司库奇尤单抗': 'secukinumab', '依奇珠单抗': 'ixekizumab', '托珠单抗': 'tocilizumab',
  '巴瑞替尼': 'baricitinib', '托法替布': 'tofacitinib', '甲氨蝶呤': 'methotrexate',
  '来氟米特': 'leflunomide', '柳氮磺吡啶': 'sulfasalazine', '金诺芬': 'auranofin',
  '双醋瑞因': 'diacerein', '羟氯喹': 'hydroxychloroquine', '阿那白滞素': 'anakinra',
};

const MEMO_EN = {
  'mnemonic-achei-2': 'achei', 'mnemonic-amide-2': 'amide',
  'mnemonic-betahistine-2': 'betahistine', 'mnemonic-butyphthalide-2': 'butylphthalide',
  'mnemonic-dmard-2': 'dmards', 'mnemonic-nicergoline-2': 'nicergoline',
};

const CLASS_EN = {
  'class-achei-2': 'achei', 'class-amide-2': 'amide',
  'class-b-vitamins-2': 'b-vitamins', 'class-nerve-function-2': 'nerve-function',
  'class-other-brain-2': 'other-brain',
  'class-bio-target-dmards-2': 'biodmards',
  'class-cs-dmards-2': 'csdmards',
  'class-dmards-general-2': 'dmards',
  'class-summary-biotech-drug-2': 'sum-biotech',
  'immunosuppressant-dmard-2': 'immuno-dmard',
};

const NUM_MAP = { '零': 0, '一': 1, '二': 2, '三': 3, '四': 4, '五': 5, '六': 6, '七': 7, '八': 8, '九': 9, '十': 10, '十一': 11, '十二': 12, '十三': 13, '十四': 14, '十五': 15, '十六': 16, '十七': 17, '十八': 18, '十九': 19, '二十': 20 };

function parseNum(s) {
  const m = (s || '').match(/第([一二三四五六七八九十百零\d]+)章/);
  if (m) return NUM_MAP[m[1]] !== undefined ? NUM_MAP[m[1]] : (parseInt(m[1]) || null);
  return parseInt(s) || null;
}

function parseSecNum(s) {
  const m = (s || '').match(/第([一二三四五六七八九十百零\d]+)节/);
  if (m) return NUM_MAP[m[1]] !== undefined ? NUM_MAP[m[1]] : (parseInt(m[1]) || null);
  return parseInt(s) || null;
}

function stripPrefix(t) {
  return (t || '').replace(/^(第[一二三四五六七八九十百零\d]+[章节篇节]?\s*)/, '').trim();
}

function kebab(t) {
  return (t || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
}

function getEn(label, oldId) {
  if (oldId && MEMO_EN[oldId]) return MEMO_EN[oldId];
  if (oldId && CLASS_EN[oldId]) return CLASS_EN[oldId];
  if (LABEL_EN[label]) return LABEL_EN[label];
  if (LABEL_EN[stripPrefix(label)]) return LABEL_EN[stripPrefix(label)];
  return kebab(stripPrefix(label)).substring(0, 25);
}

function lpad2(n) { return String(n || '').padStart(2, '0'); }

function parseFrontmatter(c) {
  const m = c.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!m) return {};
  let raw = {};
  try { raw = yamlParse(m[1]) || {}; } catch { return {}; }
  const data = (raw.data && typeof raw.data === 'object') ? raw.data : raw;
  return {
    id: data.id,
    label: data.label,
    essence: data.essence,
    location: data.location || {},
  };
}

// 从文件路径解析章号和节号
function parseFromPath(fp) {
  // 药二/药三: 第X章 / 第X节
  let chNum = parseNum(fp);
  let secNum = parseSecNum(fp);
  // 药一: Book/第X篇/.../第X章
  let partNum = null;
  const partM = fp.match(/第([一二三四五六七八九十百零\d]+)篇/);
  if (partM) partNum = NUM_MAP[partM[1]] !== undefined ? NUM_MAP[partM[1]] : (parseInt(partM[1]) || null);
  return { chNum, secNum, partNum };
}

function buildSuffix(bk, chNum, secNum) {
  let s = bk;
  if (chNum !== null) s += '-' + lpad2(chNum);
  if (secNum !== null) s += '-' + lpad2(secNum);
  return s;
}

function genId(fm, fp, oldId) {
  const { chNum, secNum, partNum } = parseFromPath(fp);
  const bk = BOOK_MAP[fm.location?.book] || 'y2';
  const essence = fm.essence || 'module';
  const label = fm.label || '';

  // Book级
  if (label === '药学专业知识二') return 'book-y2';
  if (label === '药学专业知识一') return 'book-y1';
  if (label === '药学综合知识与技能') return 'book-y3';
  if (label === '药事管理与法规') return 'book-y4';

  // 药物节点
  if (essence === 'medication') {
    const en = DRUG_EN[label] || kebab(stripPrefix(label)).substring(0, 20);
    return 'med-' + en + '-' + buildSuffix(bk, chNum, secNum);
  }

  // 口诀节点
  if (essence === 'mnemonic') {
    const en = MEMO_EN[oldId] || kebab(stripPrefix(label).replace(/口诀$/, '').replace(/记忆$/, '').trim()).substring(0, 20);
    return 'memo-' + en + '-' + buildSuffix(bk, chNum, secNum);
  }

  // 分类节点
  if (essence === 'classification') {
    const en = CLASS_EN[oldId] || getEn(label, oldId);
    return 'class-' + en + '-' + buildSuffix(bk, chNum, secNum);
  }

  // 药一篇级（章入口）
  if (bk === 'y1' && !secNum && partNum !== null) {
    const en = getEn(label, oldId);
    return 'ch-' + en + '-y1-' + lpad2(partNum);
  }

  // 药一章级（在篇下）
  if (bk === 'y1' && secNum !== null) {
    const en = getEn(label, oldId);
    return 'sec-' + en + '-y1-' + lpad2(partNum) + '-' + lpad2(chNum);
  }

  // 药二/药三 节级（有节号）
  if (secNum !== null) {
    const en = getEn(label, oldId);
    return 'sec-' + en + '-' + buildSuffix(bk, chNum, secNum);
  }

  // 药二/药三 章级
  if (chNum !== null) {
    const en = getEn(label, oldId);
    return 'ch-' + en + '-' + bk + '-' + lpad2(chNum);
  }

  // 兜底
  return 'node-' + kebab(stripPrefix(label)).substring(0, 20) + '-' + bk;
}

async function main() {
  const dryRun = process.argv.includes('--dry-run');
  console.log(dryRun ? '🟡 DRY-RUN 模式（仅预览）' : '🔴 LIVE 模式（将修改文件）');
  console.log('');

  const files = await glob('**/*.md', { cwd: CONTENT_DIR, absolute: false });
  const mappings = [];

  for (const file of files) {
    const full = path.join(CONTENT_DIR, file);
    const content = fs.readFileSync(full, 'utf8');
    const fm = parseFrontmatter(content);
    if (!fm.id) continue;
    const newId = genId(fm, file, fm.id);
    if (fm.id !== newId) {
      mappings.push({ file, old: fm.id, neo: newId, label: fm.label || '', essence: fm.essence || '' });
    }
  }

    // 按旧ID长度降序排列（避免短ID先匹配导致长ID被误替换）
    mappings.sort((a, b) => b.old.length - a.old.length);

  console.log('旧ID'.padEnd(45) + ' → 新ID');
  console.log('─'.repeat(95));
  for (const m of mappings) {
    console.log(m.old.padEnd(45) + ' → ' + m.neo.padEnd(50) + ' [' + m.essence + ']');
  }
  console.log('\n共 ' + mappings.length + ' 个ID需要更新\n');

  if (dryRun) {
    console.log('加 --dry-run=false 执行实际修改');
    return;
  }

  // 执行修改
  let updated = 0;
  for (const { file, old, neo } of mappings) {
    const full = path.join(CONTENT_DIR, file);
    let content = fs.readFileSync(full, 'utf8');

    // 替换自己的 id（行首缩进+id:）
    content = content.replace(
      new RegExp('(^|\\n)(\\s*id:\\s*)' + old.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'm'),
      '$1$2' + neo
    );

    // 替换 edges_out 中的 target（用严格的 "target: oldId" 匹配）
    for (const { old: ot, neo: nt } of mappings) {
      if (ot !== nt) {
        // 用 \b word boundary 确保精确匹配
        const pat = new RegExp('(target:\\s*)' + ot.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '(?=[^a-zA-Z0-9]|$)', 'g');
        content = content.replace(pat, '$1' + nt);
      }
    }

    fs.writeFileSync(full, content, 'utf8');
    updated++;
  }

  console.log('✅ 已更新 ' + updated + ' 个文件');

  // 验证
  const { execSync } = await import('node:child_process');
  try {
    execSync('npm run validate', { cwd: path.resolve('.'), stdio: 'inherit' });
    console.log('✅ 验证通过');
  } catch { console.log('⚠️ 验证有警告'); }

  console.log('\n📋 生成索引...');
  execSync('node --import tsx scripts/gen-index.ts', { cwd: path.resolve('.'), stdio: 'inherit' });
  console.log('✅ 完成！');
}

main().catch(console.error);
