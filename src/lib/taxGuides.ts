// 跟 IRD / Companies Office 打交道的流程清单（3/31 结账、已注册 GST 的小公司）。
// 双语用 { en, zh } 成对写，类型保证两种语言都不缺。规则改了要连同 taxCalendar.ts 一起改。
import type { Locale } from './i18n';

export interface L {
  en: string;
  zh: string;
}
export const loc = (l: L, locale: Locale) => l[locale];

export type GuideId =
  | 'gst'
  | 'yearEnd'
  | 'incomeTax'
  | 'provisional'
  | 'annualReturn'
  | 'paye'
  | 'records';

export interface Guide {
  id: GuideId;
  title: L;
  summary: L;
  steps: L[];
  links: { label: L; url: string }[];
}

export const GUIDES: Guide[] = [
  {
    id: 'gst',
    title: { en: 'Filing a GST return', zh: '每期 GST 申报怎么做' },
    summary: {
      en: 'Every GST period, even if there is nothing to report or you are due a refund.',
      zh: '每个 GST 申报期都要报，即使这期是 0 或者要退税。',
    },
    steps: [
      {
        en: 'After the period ends, open Stats, choose GST and step to that period. Check every sale invoice and purchase receipt is in the app.',
        zh: '申报期结束后，打开「统计 → GST 期」翻到这一期，确认所有收入发票和支出票据都已录入。',
      },
      {
        en: 'Log in to myIR, open your company’s GST account, pick the period and choose File return.',
        zh: '登录 myIR，进入公司的 GST 账户，选择这一期，点 File return（提交申报）。',
      },
      {
        en: 'Enter boxes 5, 6 and 11 from the app. myIR works out boxes 8, 12 and 15; they should match the app.',
        zh: '把 App 显示的第 5、6、11 栏填进去。第 8、12、15 栏 myIR 会自动算出，应该和 App 一致。',
      },
      {
        en: 'Adjustments go in box 9 (adds GST, e.g. the yearly 50% entertainment adjustment or private use) or box 13 (reduces GST).',
        zh: '调整项填第 9 栏（增加应缴，例如每年一次的招待费 50% 调整、私人使用）或第 13 栏（减少应缴）。',
      },
      {
        en: 'Submit, then pay by the due date in myIR or through internet banking (pay Inland Revenue, use the company IRD number, tax type GST and the period end date).',
        zh: '提交后在截止日前缴款：在 myIR 里付，或用网银付给 Inland Revenue（填公司 IRD 号码、税种 GST、期末日期）。',
      },
      {
        en: 'Due on the 28th of the month after the period ends. Periods ending in March are due 7 May; November, 15 January. Late filing and late payment bring penalties and interest.',
        zh: '截止日是期末次月 28 日；3 月结束的期是 5 月 7 日，11 月结束的期是次年 1 月 15 日。迟报、迟缴都会有罚款和利息。',
      },
    ],
    links: [
      {
        label: { en: 'IRD: Filing GST', zh: 'IRD：GST 申报' },
        url: 'https://www.ird.govt.nz/gst/filing-and-paying-gst-and-refunds/filing-gst',
      },
      { label: { en: 'myIR login', zh: '登录 myIR' }, url: 'https://myir.ird.govt.nz/' },
    ],
  },
  {
    id: 'yearEnd',
    title: { en: 'Around 31 March (tax year end)', zh: '财年结束（3 月 31 日）前后' },
    summary: {
      en: 'Tidy up the year so the income tax return is straightforward.',
      zh: '把一年的账收拾干净，所得税申报才好做。',
    },
    steps: [
      {
        en: 'Before 31 March: capture every receipt and sales invoice for the year.',
        zh: '3 月 31 日前：把这一财年所有票据和收入发票录进 App。',
      },
      {
        en: 'Before 31 March: write off debts you will never collect. Bad debts only count if written off before year end.',
        zh: '3 月 31 日前：确定收不回的欠款要注销，坏账只有在年底前注销才能抵扣。',
      },
      {
        en: 'In the last GST return of the year, add back half the GST on entertainment in box 9. The To-do page shows an estimate.',
        zh: '在财年最后一期 GST 申报里，把招待费 GST 的一半加回第 9 栏。待办里有估算金额。',
      },
      {
        en: 'If you took money out of the company for private use, your shareholder current account may be overdrawn at year end. That has tax costs, so sort it out with your accountant.',
        zh: '如果你从公司拿过私人用的钱，年底股东往来账户可能透支，透支有税务成本，要和会计一起处理。',
      },
      {
        en: 'In April: Export → Last tax year downloads the CSV. Keep it with your bank statements for the financial statements.',
        zh: '4 月：「导出 → 上财年」下载 CSV，和银行对账单一起用来做财务报表。',
      },
      {
        en: 'Companies must prepare basic financial statements (profit and loss, balance sheet) every year for tax.',
        zh: '公司每年都要为报税准备基本的财务报表（损益表、资产负债表）。',
      },
    ],
    links: [
      {
        label: { en: 'IRD: Entertainment expenses', zh: 'IRD：招待费' },
        url: 'https://www.ird.govt.nz/income-tax/income-tax-for-businesses-and-organisations/types-of-business-expenses/entertainment-expenses',
      },
    ],
  },
  {
    id: 'incomeTax',
    title: { en: 'Income tax return (IR4 and IR3)', zh: '所得税申报（公司 IR4 + 个人 IR3）' },
    summary: {
      en: 'Once a year. The company pays 28% on its profit.',
      zh: '一年一次。公司利润按 28% 交税。',
    },
    steps: [
      {
        en: 'File the company return (IR4) in myIR, with the financial statements summary (IR10).',
        zh: '在 myIR 提交公司所得税申报表 IR4，附财务报表摘要 IR10。',
      },
      {
        en: 'If the company pays you a shareholder salary, it is a company expense, and you declare it in your own return (IR3).',
        zh: '如果公司给你发股东工资，这笔钱是公司的费用，同时你要在个人申报表 IR3 里申报。',
      },
      {
        en: 'Without a tax agent both returns are due 7 July. With a tax agent, usually 31 March the following year.',
        zh: '没有税务代理：两份申报都在 7 月 7 日截止。有税务代理：通常可延到次年 3 月 31 日。',
      },
      {
        en: 'Any tax left to pay (terminal tax) is due 7 February the following year, or 7 April with a tax agent.',
        zh: '申报后还要补缴的税（年终税）在次年 2 月 7 日截止，有税务代理是 4 月 7 日。',
      },
      {
        en: 'First year in business: there is usually no provisional tax, but the next year can bring two years of tax at once. Paying some early voluntarily reduces that hit.',
        zh: '第一年做生意通常不用交预缴税，但第二年可能同时要交两年的税。可以提前自愿缴一部分，减轻压力。',
      },
    ],
    links: [
      {
        label: { en: 'IRD: Key dates (IR328)', zh: 'IRD：重要日期表（IR328）' },
        url: 'https://www.ird.govt.nz/-/media/project/ir/home/documents/forms-and-guides/ir300---ir399/ir328/ir328-2026-27.pdf',
      },
      {
        label: { en: 'IRD: Tax in your first year', zh: 'IRD：第一年的税' },
        url: 'https://www.ird.govt.nz/income-tax/provisional-tax/paying-tax-in-your-first-year-in-business',
      },
    ],
  },
  {
    id: 'provisional',
    title: { en: 'Provisional tax', zh: '预缴税（provisional tax）' },
    summary: {
      en: 'Paying this year’s income tax in instalments. Only needed if last year’s tax to pay was over $5,000.',
      zh: '把今年的所得税分期提前交。只有上一年年终应缴超过 $5,000 才需要。',
    },
    steps: [
      {
        en: 'Check last year’s assessment: if the residual income tax was over $5,000, you must pay provisional tax this year.',
        zh: '看上一年的税单：如果年终应缴税额（residual income tax）超过 $5,000，今年就必须交预缴税。',
      },
      {
        en: 'Standard option: last year’s tax plus 5%, in 3 instalments on 28 August, 15 January and 7 May.',
        zh: '标准法：按上一年税额加 5% 估算，分 3 期在 8 月 28 日、1 月 15 日、5 月 7 日缴。',
      },
      {
        en: 'If you file GST six-monthly, the standard option has only 2 instalments: 28 October and 7 May.',
        zh: '如果你每半年报一次 GST，标准法只分 2 期：10 月 28 日和 5 月 7 日。',
      },
      {
        en: 'Other options exist (estimation, ratio, AIM). Ask your accountant if your income changes a lot.',
        zh: '还有其他算法（估算法、比例法、AIM），收入波动大时问一下会计。',
      },
      {
        en: 'Set "Provisional tax" below to Standard and the instalments appear in your to-do list.',
        zh: '在下面「你的情况」把预缴税设为"需要"，各期就会出现在待办里。',
      },
    ],
    links: [
      {
        label: { en: 'IRD: Provisional tax dates', zh: 'IRD：预缴税日期' },
        url: 'https://www.ird.govt.nz/income-tax/provisional-tax/paying-your-provisional-tax/payment-dates-for-provisional-tax',
      },
    ],
  },
  {
    id: 'annualReturn',
    title: { en: 'Companies Office annual return', zh: 'Companies Office 公司年度申报' },
    summary: {
      en: 'Not IRD. Every company confirms its details once a year, or it can be removed from the register.',
      zh: '这不是 IRD 的事。每家公司每年都要确认一次登记信息，不交公司可能被注销。',
    },
    steps: [
      {
        en: 'Find your filing month: search your company on the Companies Office register; the company summary shows the annual return filing month.',
        zh: '查申报月份：在 Companies Office 网站搜你的公司名，公司详情页写着年度申报月份（Annual return filing month）。',
      },
      {
        en: 'During that month, log in with RealMe, confirm directors, shareholders and addresses, and pay the fee (about $50 plus GST).',
        zh: '在那个月内用 RealMe 登录，确认董事、股东和地址，然后付费（约 $50 加 GST）。',
      },
      {
        en: 'Set the filing month below so it appears in your to-do list.',
        zh: '在下面「你的情况」填上申报月份，它就会出现在待办里。',
      },
    ],
    links: [
      {
        label: { en: 'Companies Office: Annual returns', zh: 'Companies Office：年度申报' },
        url: 'https://companies-register.companiesoffice.govt.nz/help-centre/company-annual-returns/',
      },
    ],
  },
  {
    id: 'paye',
    title: { en: 'If you pay wages (PAYE)', zh: '如果你通过 PAYE 发工资' },
    summary: {
      en: 'Only if the company pays you or staff through PAYE, not a shareholder salary.',
      zh: '只适用于公司通过 PAYE 给你或员工发工资（不是股东工资）。',
    },
    steps: [
      {
        en: 'After every payday, file the employment information in myIR within 2 working days.',
        zh: '每次发工资后 2 个工作日内，在 myIR 提交雇佣信息（payday filing）。',
      },
      {
        en: 'If your PAYE is under $500,000 a year, pay last month’s deductions by the 20th.',
        zh: '每年 PAYE 低于 $500,000 的，每月 20 日前缴上个月扣下的税。',
      },
    ],
    links: [
      {
        label: { en: 'IRD: Paying deductions', zh: 'IRD：缴纳代扣税' },
        url: 'https://www.ird.govt.nz/employing-staff/payday-filing/paying-deductions-to-inland-revenue',
      },
    ],
  },
  {
    id: 'records',
    title: { en: 'Records and invoices', zh: '记录和发票要求' },
    summary: {
      en: 'What to keep so your GST claims hold up.',
      zh: '保存哪些东西，抵扣的 GST 才站得住。',
    },
    steps: [
      {
        en: 'Keep business records for 7 years. Clear photos in this app, synced to your private repo, count as electronic records.',
        zh: '业务记录要保存 7 年。App 里清晰的票据照片同步到私有仓库，就算电子记录。',
      },
      {
        en: 'For purchases over $200 the receipt needs the supplier’s name and GST number, the date, a description and the amount.',
        zh: '超过 $200 的支出，票据上要有供应商名称和 GST 号、日期、商品描述和金额。',
      },
      {
        en: 'Over $1,000 it also needs your company name plus one contact detail (address, phone, email, NZBN or website). The To-do page flags these.',
        zh: '超过 $1,000 的，还要有你公司的名称和一项联系方式（地址、电话、邮箱、NZBN 或网址）。待办页会提醒你核对。',
      },
      {
        en: 'A deadline on a weekend or public holiday moves to the next working day.',
        zh: '截止日遇到周末或公众假期，顺延到下一个工作日。',
      },
    ],
    links: [
      {
        label: { en: 'IRD: Taxable supply information', zh: 'IRD：发票信息要求' },
        url: 'https://www.ird.govt.nz/gst/tax-invoices-for-gst/how-tax-invoices-for-gst-work',
      },
    ],
  },
];

/** 每种待办对应哪份指南 */
export const GUIDE_FOR_TASK = {
  gst: 'gst',
  incomeTax: 'incomeTax',
  terminalTax: 'incomeTax',
  provisional: 'provisional',
  paye: 'paye',
  annualReturn: 'annualReturn',
} as const satisfies Record<string, GuideId>;
