export type Space = 'personal' | 'company';
export type Kind = 'income' | 'expense';
export type PhotoKind = 'webp' | 'jpeg' | 'pdf';

export interface PhotoRef {
  id: string;
  kind: PhotoKind;
}

export interface Receipt {
  id: string; // ULID
  space: Space;
  kind?: Kind; // 缺省视为 'expense'（兼容旧数据），读取用 kindOf()
  date: string; // YYYY-MM-DD
  merchant: string;
  totalCents: number;
  gstCents: number; // personal 空间恒为 0
  category: string;
  note?: string;
  items?: string[]; // 商品/服务明细（AI 提取或手填，每项一条）
  photos: PhotoRef[];
  createdAt: string; // ISO 8601
  updatedAt: string; // ISO 8601，LWW 合并依据
  deleted?: boolean; // 软删除墓碑
}

export const kindOf = (r: Pick<Receipt, 'kind'>): Kind => r.kind ?? 'expense';

export interface AppConfig {
  categories: Record<Space, Record<Kind, string[]>>;
}

export const DEFAULT_CONFIG: AppConfig = {
  categories: {
    company: {
      expense: [
        'Office Supplies',
        'Software & SaaS',
        'Fuel',
        'Parking',
        'Meals & Entertainment',
        'Travel',
        'Equipment',
        'Other',
      ],
      income: ['Sales', 'Services', 'Interest', 'Other'],
    },
    personal: {
      expense: ['Groceries', 'Dining', 'Transport', 'Utilities', 'Health', 'Other'],
      income: ['Salary', 'Refunds', 'Interest', 'Other'],
    },
  },
};
