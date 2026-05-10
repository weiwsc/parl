import { useAppContext } from '../store';
import type { FactionStance, Language, LawStatus } from '../models/types';

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
  current_parliament:    { en: 'Current Parliament',   cn: '当前议会' },
  latest_election:       { en: 'Latest Election',      cn: '最近选举' },
  no_current_parliament: { en: 'No election has been recorded yet.', cn: '尚未记录选举。' },
  election_history:      { en: 'History',              cn: '选举历史' },
  parliament:            { en: 'Parliament',           cn: '议会' },
  hold_election:         { en: 'Hold Election',        cn: '进行选举' },
  total_seats:           { en: 'Total Seats',          cn: '总席位' },
  base_randomness:       { en: 'Base Randomness',      cn: '基础随机性' },
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
  legislature:           { en: 'Legislature',          cn: '立法机构' },
  legislative_chamber:    { en: 'Legislative Chamber',  cn: '立法议事厅' },
  events:                { en: 'Events',               cn: '事件' },
  chronicle_archive:      { en: 'Chronicle Archive',    cn: '编年档案' },
  news:                  { en: 'News',                 cn: '新闻' },
  export_newspaper:       { en: 'Export Newspaper',     cn: '导出报纸' },
  exporting:              { en: 'Exporting...',         cn: '正在导出...' },
  newspaper_exported:     { en: 'Newspaper exported',   cn: '报纸已导出' },
  newspaper_exported_svg: { en: 'Newspaper exported as SVG', cn: '报纸已导出为 SVG' },
  newspaper_export_failed:{ en: 'Newspaper export failed', cn: '报纸导出失败' },
  timeline:              { en: 'Timeline',             cn: '时间线' },
  archive:               { en: 'Archive',              cn: '档案' },
  editor:                { en: 'Editor',               cn: '编辑器' },
  edition:               { en: 'Edition',              cn: '版次' },
  stories:               { en: 'stories',              cn: '报道' },
  event_count:            { en: 'events',               cn: '事件' },
  turns:                 { en: 'turns',                cn: '回合' },
  turn:                  { en: 'Turn',                 cn: '回合' },
  event_editor:           { en: 'Event Editor',         cn: '事件编辑器' },
  newspaper_settings:     { en: 'Newspaper Settings',   cn: '报纸设置' },
  newspaper_name:         { en: 'Newspaper Name',       cn: '报纸名称' },
  newspaper_name_placeholder: { en: 'The Parliamentary Gazette', cn: '议会公报' },
  issue_title:            { en: 'Issue Title',          cn: '本期标题' },
  turn_newspaper:         { en: 'Turn Newspaper',       cn: '回合报纸' },
  turn_newspaper_name:     { en: 'Turn Newspaper Name',  cn: '本回合报纸名称' },
  default_newspaper_name:  { en: 'Default Newspaper Name', cn: '默认报纸名称' },
  new_turns:              { en: '(new turns)',          cn: '（新回合）' },
  turn_filter:            { en: 'Turn Filter',          cn: '回合筛选' },
  add_turn:               { en: 'Add Turn',             cn: '添加回合' },
  new_event:              { en: 'New Event',            cn: '新建事件' },
  no_events:              { en: 'No events recorded.',  cn: '尚未记录事件。' },
  no_events_turn:         { en: 'No events on this turn.', cn: '此回合没有事件。' },
  select_event_to_open:   { en: 'Select an event from the index.', cn: '从索引中选择事件。' },
  turn_number:            { en: 'Turn Number',          cn: '回合编号' },
  story_rank:             { en: 'Story Rank',           cn: '报道等级' },
  event_rank_notice:      { en: 'Notice',               cn: '简讯' },
  event_rank_dispatch:    { en: 'Dispatch',             cn: '快讯' },
  event_rank_feature:     { en: 'Feature',              cn: '专题' },
  event_rank_headline:    { en: 'Headline',             cn: '头条' },
  event_rank_breaking:    { en: 'Breaking News',        cn: '突发新闻' },
  body:                  { en: 'Body',                 cn: '正文' },
  event_title_placeholder:{ en: 'Event title...',       cn: '事件标题...' },
  event_body_placeholder: { en: 'Write the event body in Markdown...', cn: '用 Markdown 编写事件正文...' },
  no_event_body:          { en: 'No event body.',        cn: '没有事件正文。' },
  duplicate:              { en: 'Duplicate',            cn: '复制' },
  event_created:          { en: 'Event created',        cn: '事件已创建' },
  turn_created:           { en: 'Turn added',           cn: '回合已添加' },
  event_deleted:          { en: 'Event deleted',        cn: '事件已删除' },
  delete_event_confirm:   { en: 'Delete this event permanently?', cn: '永久删除这项事件？' },
  upper_chamber:          { en: 'Upper Chamber',        cn: '上议院' },
  senate:                { en: 'Senate',               cn: '参议院' },
  parliament_short:       { en: 'parl',                 cn: '议会' },
  senate_short:           { en: 'senate',               cn: '参院' },
  factions:              { en: 'factions',             cn: '派系' },
  parliament_floor:       { en: 'Parliament Floor',     cn: '议会会场' },
  senate_floor:           { en: 'Senate Floor',         cn: '参议院会场' },
  bills:                 { en: 'Bills',                cn: '法案' },
  constitution:           { en: 'Constitution',         cn: '宪法' },
  vote_history:           { en: 'Vote History',         cn: '投票历史' },
  simulation:             { en: 'Simulation',           cn: '模拟' },
  history:                { en: 'History',              cn: '历史' },
  map:                    { en: 'Map',                  cn: '地图' },
  support:                { en: 'Support',              cn: '支持' },
  abstain:                { en: 'Abstain',              cn: '弃权' },
  against:                { en: 'Against',              cn: '反对' },
  your_vote:              { en: 'Your Vote',            cn: '你的投票' },
  voting_rate:            { en: 'Voting Rate',          cn: '投票率' },
  status:                 { en: 'Status',               cn: '状态' },
  net_seats:              { en: 'net seats',            cn: '净席位' },
  vs:                     { en: 'vs',                   cn: '对' },
  bill_queue:             { en: 'Bills Queue',          cn: '法案队列' },
  bill_count:             { en: 'bills',                cn: '法案' },
  no_draft_bills:         { en: 'No draft bills.',      cn: '没有草案法案。' },
  no_voting_bills:        { en: 'No bills are currently voting.', cn: '当前没有正在投票的法案。' },
  create_laws_hint:       { en: 'Create laws in the Bills tab.', cn: '在“法案”标签页创建法律。' },
  on_floor:               { en: 'On Floor',             cn: '会场中' },
  bring_to_floor:         { en: 'Bring to Floor',       cn: '提交会场' },
  drop_here:              { en: 'drop here',            cn: '拖到这里' },
  no_bill_on_floor:       { en: 'No bill on the floor', cn: '会场上没有法案' },
  select_bill_queue:      { en: 'Select a bill from the queue on the left', cn: '从左侧队列中选择法案' },
  select_bill_debate:     { en: 'Select a bill from the queue to begin debate', cn: '从队列中选择法案开始辩论' },
  edit:                   { en: 'Edit',                 cn: '编辑' },
  move_to_constitution:    { en: 'Move to Constitution', cn: '移入宪法' },
  remove_from_constitution:{ en: 'Remove from Constitution', cn: '移出宪法' },
  preamble:               { en: 'Preamble',             cn: '序言' },
  clauses:                { en: 'Clauses',              cn: '条款' },
  conclude_voting:        { en: 'Conclude Voting',      cn: '结束投票' },
  set_final_status:       { en: 'Set Final Status',     cn: '设置最终状态' },
  cancel:                 { en: 'Cancel',               cn: '取消' },
  close:                  { en: 'Close',                cn: '关闭' },
  apply:                  { en: 'Apply',                cn: '应用' },
  all:                    { en: 'All',                  cn: '全部' },
  new_bill:               { en: 'New Bill',             cn: '新建法案' },
  edit_bill:              { en: 'Edit Bill',            cn: '编辑法案' },
  no_bills_category:      { en: 'No bills in this category.', cn: '此分类中没有法案。' },
  open_law:               { en: 'Open law',             cn: '打开法律' },
  title:                  { en: 'Title',                cn: '标题' },
  subtitle:               { en: 'Subtitle',             cn: '副标题' },
  optional:               { en: '(optional)',           cn: '（可选）' },
  description:            { en: 'Description',          cn: '描述' },
  markdown:               { en: '(markdown)',           cn: '（Markdown）' },
  preview:                { en: 'Preview',              cn: '预览' },
  clause_text_placeholder:{ en: 'Clause text...',       cn: '条款文本...' },
  add_clause:             { en: 'Add Clause',           cn: '添加条款' },
  constitutional_law:     { en: 'Constitutional Law',   cn: '宪法性法律' },
  constitutional_law_hint:{ en: 'Constitutional laws are displayed separately in the Constitution tab', cn: '宪法性法律会单独显示在宪法标签页中' },
  save_changes:           { en: 'Save Changes',         cn: '保存更改' },
  create_bill:            { en: 'Create Bill',          cn: '创建法案' },
  bill_title_placeholder: { en: 'Bill title...',        cn: '法案标题...' },
  short_description_placeholder: { en: 'Short description...', cn: '简短描述...' },
  markdown_placeholder:   { en: 'Use **bold**, *italic*, # Heading, - list item...', cn: '可使用 **粗体**、*斜体*、# 标题、- 列表项...' },
  no_description:         { en: 'No description.',      cn: '没有描述。' },
  outdent:                { en: 'Outdent',              cn: '减少缩进' },
  indent:                 { en: 'Indent',               cn: '增加缩进' },
  no_constitutional_laws: { en: 'No constitutional laws defined.', cn: '尚未定义宪法性法律。' },
  constitution_empty_hint:{ en: 'In the Bills tab, press the constitution button on any law.', cn: '在“法案”标签页点击任意法律上的宪法按钮。' },
  constitutional_laws:    { en: 'Constitutional Laws',  cn: '宪法性法律' },
  article:                { en: 'article',              cn: '条' },
  articles:               { en: 'articles',             cn: '条' },
  no_voting_records:      { en: 'No voting records yet.', cn: '尚无投票记录。' },
  record_deleted:         { en: 'Record deleted',       cn: '记录已删除' },
  passed:                 { en: 'Passed',               cn: '通过' },
  failed:                 { en: 'Failed',               cn: '失败' },
  law_status_draft:       { en: 'Draft',                cn: '草案' },
  law_status_voting:      { en: 'Voting',               cn: '投票中' },
  law_status_effect:      { en: 'In Effect',            cn: '已生效' },
  law_status_abolished:   { en: 'Abolished',            cn: '已废止' },
  law_status_failed:      { en: 'Failed',               cn: '失败' },
  vote_status_failing_quorum: { en: 'Failing (Not Enough Vote)', cn: '未通过（投票不足）' },
  vote_status_passing:    { en: 'Passing',              cn: '正在通过' },
  vote_status_failing:    { en: 'Failing',              cn: '正在失败' },
  vote_status_tied:       { en: 'Tied',                 cn: '平票' },
  vote_status_no_vote:    { en: 'No Vote',              cn: '无人投票' },
  vote_conclusion_pass:   { en: 'Pass',                 cn: '通过' },
  vote_conclusion_fail:   { en: 'Fail',                 cn: '失败' },
  vote_conclusion_tie_fail: { en: 'Tie -> Fail',        cn: '平票 -> 失败' },
  vote_submitted:         { en: 'Vote submitted',       cn: '投票已提交' },
  vote_failed:            { en: 'Vote failed',          cn: '投票失败' },
  bill_concluded:         { en: 'Bill concluded',       cn: '法案投票已结束' },
  bill_created:           { en: 'Bill created',         cn: '法案已创建' },
  bill_updated:           { en: 'Bill updated',         cn: '法案已更新' },
  bill_deleted:           { en: 'Bill deleted',         cn: '法案已删除' },
  delete_bill_confirm:    { en: 'Delete this bill permanently?', cn: '永久删除这项法案？' },
  status_changed:         { en: 'Status',               cn: '状态' },
  auto_assign:            { en: 'Auto-Assign',          cn: '自动分配' },
  auto_assign_title:      { en: 'Auto-assign seats from 100%-controlled regions', cn: '从100%控制的地区自动分配席位' },
  strata_assign:          { en: 'Strata-Assign',        cn: '阶层分配' },
  strata_assign_title:    { en: 'Assign seats for uncontrolled regions by strata composition', cn: '未完全控制地区按阶层构成分配席位' },
  assigned_only:          { en: 'Assigned Only',        cn: '仅已分配' },
  assigned_only_title:    { en: 'Hide seats with no faction from Senate charts and percentage calculations', cn: '在参议院图表和百分比计算中隐藏无派系席位' },
  record_election:        { en: 'Record Election',      cn: '记录选举' },
  senate_election_recorded: { en: 'Senate election recorded!', cn: '参议院选举已记录！' },
  regions:                { en: 'Regions',              cn: '地区' },
  seats_total:            { en: 'seats total',          cn: '总席位' },
  auto_assigned:          { en: 'auto-assigned',        cn: '自动分配' },
  no_regions_with_seats:  { en: 'No regions with seats. Set seatings in the Map inspector.', cn: '没有设置席位的地区。请在地图检查器中设置席位。' },
  auto_assigned_to:       { en: 'Auto-assigned to',     cn: '自动分配给' },
  uncontrolled:           { en: 'Uncontrolled',         cn: '未控制' },
  auto_controlled_regions:{ en: 'Auto (controlled regions)', cn: '自动（控制地区）' },
  manual_extra:           { en: 'Manual Extra',         cn: '手动额外' },
  no_factions_alliance:   { en: 'No factions in this alliance', cn: '此联盟中没有派系' },
  no_factions_senate:     { en: 'No factions defined. Add factions in the Parliament page.', cn: '尚未定义派系。请在议会页面添加派系。' },
  senate_archive:         { en: 'Senate Election Archive', cn: '参议院选举档案' },
  clear_all:              { en: 'Clear All',            cn: '清空全部' },
  clear_senate_history_confirm: { en: 'Clear entire senate history?', cn: '清空全部参议院历史？' },
  history_cleared:        { en: 'History cleared',      cn: '历史已清空' },
  no_senate_elections:    { en: 'No senate elections recorded.', cn: '尚未记录参议院选举。' },
  name_this_election:     { en: 'Name this election...', cn: '命名本次选举...' },
  delete_short:           { en: 'DEL',                  cn: '删' },
  faction:                { en: 'Faction',              cn: '派系' },
  alliance:               { en: 'Alliance',             cn: '联盟' },
  no_regions:             { en: 'No regions',           cn: '没有地区' },
  map_view:               { en: 'Map View',             cn: '地图视图' },
  no_regions_defined:     { en: 'No regions defined',   cn: '尚未定义地区' },
} as const;

export type TranslationKey = keyof typeof translations;
export type Translator = (key: TranslationKey) => string;

export function useLang() {
  const { state } = useAppContext();
  const language = state.ui.language;
  return (key: TranslationKey): string =>
    translations[key]?.[language] ?? translations[key]?.en ?? key;
}

export function lawStatusLabel(t: Translator, status: LawStatus): string {
  switch (status) {
    case 'draft': return t('law_status_draft');
    case 'voting': return t('law_status_voting');
    case 'effect': return t('law_status_effect');
    case 'abolished': return t('law_status_abolished');
    case 'failed': return t('law_status_failed');
  }
}

export function stanceLabel(t: Translator, stance: FactionStance): string {
  switch (stance) {
    case 'support': return t('support');
    case 'abstain': return t('abstain');
    case 'against': return t('against');
  }
}

export function voteStatusLabel(t: Translator, label: string): string {
  switch (label) {
    case 'FAILING (NOT ENOUGH VOTE)': return t('vote_status_failing_quorum');
    case 'PASSING': return t('vote_status_passing');
    case 'FAILING': return t('vote_status_failing');
    case 'TIED': return t('vote_status_tied');
    case 'NO VOTE': return t('vote_status_no_vote');
    default: return label;
  }
}

export function voteConclusionLabel(t: Translator, label: string): string {
  switch (label) {
    case 'PASS': return t('vote_conclusion_pass');
    case 'FAIL': return t('vote_conclusion_fail');
    case 'TIE -> FAIL': return t('vote_conclusion_tie_fail');
    default: return label;
  }
}
