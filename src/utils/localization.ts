import { useAppContext } from '../store';
import type { Language } from '../models/types';

export const LANGUAGES: { code: Language; native: string }[] = [
  { code: 'en', native: 'EN' },
  { code: 'cn', native: '中文' },
];

const translations: Record<string, Record<Language, string>> = {
  add_faction:           { en: 'Add Faction',         cn: '创建派系' },
  add_alliance:          { en: 'Add Alliance',         cn: '创建联盟' },
  political_factions:    { en: 'Political Factions',   cn: '政治派系' },
  social_strata:         { en: 'Social Strata',        cn: '社会阶层' },
  add_strata:            { en: 'Add Stratum',          cn: '创建阶层' },
  election:              { en: 'Election',            cn: '选举' },
  election_history:      { en: 'History',              cn: '选举历史' },
  parliament:            { en: 'Parliament',           cn: '议会' },
  hold_election:         { en: 'Hold Election',        cn: '进行选举' },
  total_seats:           { en: 'Total Seats',          cn: '总席位' },
  seats:                 { en: 'Seats',                cn: '议席' },
  projected_composition: { en: 'Projected Composition', cn: '预计结果' },
  settings:              { en: 'Settings',             cn: '设置' },
  appearance:            { en: 'Appearance',           cn: '外观' },
  language:              { en: 'Language',             cn: '语言' },
  theme:                 { en: 'Theme',                cn: '主题' },
  data:                  { en: 'Data',                 cn: '数据' },
  export:                { en: 'Export State',         cn: '导出数据' },
  import:                { en: 'Import State',         cn: '导入数据' },
  account:               { en: 'Account',              cn: '账户' },
  login:                 { en: 'Login',                cn: '登录' },
  logout:                { en: 'Logout',               cn: '退出' },
  username:              { en: 'Username',             cn: '用户名' },
  password:              { en: 'Password',             cn: '密码' },
  admin:                 { en: 'Admin',                cn: '管理员' },
  guest:                 { en: 'Guest',                cn: '访客' },
  unaligned_seats:       { en: 'Unaligned Seats',      cn: '无归属席位' },
} as const;

type TranslationKey = keyof typeof translations;

export function useLang() {
  const { state } = useAppContext();
  const language = state.ui.language;
  return (key: TranslationKey): string =>
    translations[key]?.[language] ?? translations[key]?.en ?? key;
}
