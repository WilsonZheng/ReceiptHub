export type Space = 'personal' | 'company';
export type PhotoKind = 'webp' | 'jpeg' | 'pdf';

export interface PhotoRef {
  id: string;
  kind: PhotoKind;
}

export interface Receipt {
  id: string; // ULID
  space: Space;
  date: string; // YYYY-MM-DD
  merchant: string;
  totalCents: number;
  gstCents: number; // personal 空间恒为 0
  category: string;
  note?: string;
  photos: PhotoRef[];
  createdAt: string; // ISO 8601
  updatedAt: string; // ISO 8601，LWW 合并依据
  deleted?: boolean; // 软删除墓碑
}

export interface AppConfig {
  categories: Record<Space, string[]>;
}

export const DEFAULT_CONFIG: AppConfig = {
  categories: {
    company: [
      'Office Supplies',
      'Software & SaaS',
      'Fuel',
      'Parking',
      'Meals & Entertainment',
      'Travel',
      'Equipment',
      'Other',
    ],
    personal: ['Groceries', 'Dining', 'Transport', 'Utilities', 'Health', 'Other'],
  },
};
