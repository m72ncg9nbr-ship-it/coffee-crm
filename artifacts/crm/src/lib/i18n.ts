export type Lang = "en" | "tr";

export const dict = {
  // ── App branding ────────────────────────────────────────────────────────────
  appName:              { en: "NS Global Operations Hub",            tr: "NS Global Operasyon Merkezi" },
  appSubtitle:          { en: "Coffee & Cosmetics Channel Management", tr: "Kahve ve Kozmetik Kanal Yönetimi" },
  signIn:               { en: "Sign in to your account",             tr: "Hesabınıza giriş yapın" },
  enterCredentials:     { en: "Enter your credentials to access the system", tr: "Sisteme erişmek için bilgilerinizi girin" },
  username:             { en: "Username",                            tr: "Kullanıcı Adı" },
  password:             { en: "Password",                            tr: "Şifre" },
  signingIn:            { en: "Signing in...",                       tr: "Giriş yapılıyor..." },
  signInBtn:            { en: "Sign in",                             tr: "Giriş Yap" },
  demoAccounts:         { en: "Demo accounts (click to fill):",      tr: "Demo hesaplar (doldurmak için tıklayın):" },
  invalidCredentials:   { en: "Invalid username or password",        tr: "Geçersiz kullanıcı adı veya şifre" },
  signOut:              { en: "Sign out",                            tr: "Çıkış Yap" },

  // ── Channels ────────────────────────────────────────────────────────────────
  allChannels:          { en: "All Channels",  tr: "Tüm Kanallar" },
  coffee:               { en: "Coffee",        tr: "Kahve" },
  cosmetics:            { en: "Cosmetics",     tr: "Kozmetik" },
  channel:              { en: "Channel",       tr: "Kanal" },
  selectChannel:        { en: "Select channel", tr: "Kanal seçin" },

  // ── Navigation ──────────────────────────────────────────────────────────────
  dashboard:            { en: "Dashboard",          tr: "Gösterge Paneli" },
  generalDashboard:     { en: "General Dashboard",  tr: "Genel Dashboard" },
  coffeeDashboard:      { en: "Coffee Dashboard",   tr: "Kahve Dashboard" },
  cosmeticsDashboard:   { en: "Cosmetics Dashboard",tr: "Kozmetik Dashboard" },
  customers:            { en: "Customers",          tr: "Müşteriler" },
  leads:                { en: "Leads",              tr: "Potansiyel Müşteriler" },
  products:             { en: "Products",           tr: "Ürünler" },
  inventory:            { en: "Inventory",          tr: "Stok" },
  orders:               { en: "Orders",             tr: "Siparişler" },
  deliveries:           { en: "Deliveries",         tr: "Teslimatlar" },
  approvals:            { en: "Approvals",          tr: "Onaylar" },
  readyForInvoicing:    { en: "Ready for Invoicing",tr: "Faturalamaya Hazır" },
  activity:             { en: "Activity",           tr: "Aktivite" },
  reports:              { en: "Reports",            tr: "Raporlar" },

  // ── Dashboard stat labels ────────────────────────────────────────────────────
  totalCustomers:       { en: "Total Customers",      tr: "Toplam Müşteri" },
  aCustomers:           { en: "A Customers",          tr: "A Müşterileri" },
  openOrders:           { en: "Open Orders",          tr: "Açık Siparişler" },
  incomplete:           { en: "Incomplete",           tr: "Tamamlanmamış" },
  planned:              { en: "Planned",              tr: "Planlandı" },
  outForDelivery:       { en: "Out for Delivery",     tr: "Teslimat Yolunda" },
  delayed:              { en: "Delayed",              tr: "Gecikmiş" },
  awaitingApproval:     { en: "Awaiting Approval",    tr: "Onay Bekliyor" },
  approvedToday:        { en: "Approved Today",       tr: "Bugün Onaylandı" },
  readyInvoicing:       { en: "Ready for Invoicing",  tr: "Faturalamaya Hazır" },
  openDeviations:       { en: "Open Deviations",      tr: "Açık Sapmalar" },
  operationalOverview:  { en: "Operational overview", tr: "Operasyonel genel bakış" },
  todaysPriorities:     { en: "Today's Priorities",   tr: "Günün Öncelikleri" },
  stockOverview:        { en: "Stock Overview",       tr: "Stok Genel Bakışı" },
  allPoolsHealthy:      { en: "All pools healthy — no low-stock or out-of-stock items.", tr: "Tüm havuzlar sağlıklı — düşük stok veya stokta olmayan ürün yok." },
  outOfStock:           { en: "out of stock",   tr: "stokta yok" },
  lowStock:             { en: "low",            tr: "düşük" },
  noItems:              { en: "no items",       tr: "öğe yok" },
  noPriorities:         { en: "No open priorities right now.", tr: "Şu an açık öncelik bulunmuyor." },

  // ── Actions / Buttons ───────────────────────────────────────────────────────
  approve:              { en: "Approve",              tr: "Onayla" },
  reject:               { en: "Reject",              tr: "Reddet" },
  clearFilters:         { en: "Clear filters",        tr: "Filtreleri Temizle" },
  convertToCustomer:    { en: "Convert to Customer",  tr: "Müşteriye Dönüştür" },
  resolveIssue:         { en: "Resolve Issue",        tr: "Sorunu Çöz" },
  markResolved:         { en: "Mark Issue Resolved",  tr: "Sorun Çözüldü Olarak İşaretle" },
  resolutionNote:       { en: "Resolution Note",      tr: "Çözüm Notu" },
  uploadDocument:       { en: "Upload Document",      tr: "Belge Yükle" },
  viewDocument:         { en: "View Document",        tr: "Belgeyi Görüntüle" },
  sendToPlanning:       { en: "Send to planning",     tr: "Planlamaya Gönder" },
  saveChanges:          { en: "Save Changes",         tr: "Değişiklikleri Kaydet" },
  cancel:               { en: "Cancel",               tr: "İptal" },
  delete:               { en: "Delete",               tr: "Sil" },
  edit:                 { en: "Edit",                 tr: "Düzenle" },
  add:                  { en: "Add",                  tr: "Ekle" },
  newOrder:             { en: "New Order",            tr: "Yeni Sipariş" },
  newLead:              { en: "New Lead",             tr: "Yeni Potansiyel" },
  markAsPaid:           { en: "Mark as Paid",         tr: "Ödendi Olarak İşaretle" },
  submitLead:           { en: "Submit Lead",          tr: "Potansiyel Gönder" },
  converting:           { en: "Converting...",        tr: "Dönüştürülüyor..." },

  // ── Filter / Table labels ────────────────────────────────────────────────────
  status:               { en: "Status",         tr: "Durum" },
  paymentStatus:        { en: "Payment Status", tr: "Ödeme Durumu" },
  allStatuses:          { en: "All Statuses",   tr: "Tüm Durumlar" },
  allPayments:          { en: "All Payments",   tr: "Tüm Ödemeler" },
  allCreators:          { en: "All creators",   tr: "Tüm Oluşturanlar" },
  allRegions:           { en: "All regions",    tr: "Tüm Bölgeler" },
  allImportance:        { en: "All importance", tr: "Tüm Önem Seviyeleri" },
  allChannelsFilter:    { en: "All Channels",   tr: "Tüm Kanallar" },
  region:               { en: "Region",         tr: "Bölge" },
  importance:           { en: "Importance",     tr: "Önem" },
  createdBy:            { en: "Created By",     tr: "Oluşturan" },
  filters:              { en: "Filters",        tr: "Filtreler" },
  search:               { en: "Search",         tr: "Ara" },
  from:                 { en: "From",           tr: "Başlangıç" },
  to:                   { en: "To",             tr: "Bitiş" },
  date:                 { en: "Date",           tr: "Tarih" },
  createdDate:          { en: "Created",        tr: "Oluşturulma" },
  deliveryDate:         { en: "Delivery Date",  tr: "Teslimat Tarihi" },
  brand:                { en: "Brand",          tr: "Marka" },
  allBrands:            { en: "All Brands",     tr: "Tüm Markalar" },

  // ── Payment / Status values ──────────────────────────────────────────────────
  paid:                 { en: "Paid",           tr: "Ödendi" },
  unpaid:               { en: "Unpaid",         tr: "Ödenmedi" },
  overdue:              { en: "Overdue",        tr: "Gecikmiş" },
  notInvoiced:          { en: "Not Invoiced",   tr: "Faturalanmadı" },
  pending:              { en: "Pending",        tr: "Beklemede" },
  approved:             { en: "Approved",       tr: "Onaylandı" },
  rejected:             { en: "Rejected",       tr: "Reddedildi" },
  cancelled:            { en: "Cancelled",      tr: "İptal Edildi" },
  converted:            { en: "Converted",      tr: "Dönüştürüldü" },

  // ── Importance values ───────────────────────────────────────────────────────
  normal:               { en: "Normal",         tr: "Normal" },
  important:            { en: "Important",      tr: "Önemli" },
  highPotential:        { en: "High Potential", tr: "Yüksek Potansiyel" },

  // ── Report labels ────────────────────────────────────────────────────────────
  profitability:        { en: "Profitability",  tr: "Karlılık" },
  collection:           { en: "Collection",     tr: "Tahsilat" },
  samples:              { en: "Samples",        tr: "Numuneler" },
  regional:             { en: "Regional",       tr: "Bölgesel" },
  revenue:              { en: "Revenue",        tr: "Gelir" },
  cost:                 { en: "Cost",           tr: "Maliyet" },
  grossProfit:          { en: "Gross Profit",   tr: "Brüt Kâr" },
  margin:               { en: "Margin",         tr: "Marj" },

  // ── Empty states ─────────────────────────────────────────────────────────────
  noOrders:             { en: "No orders found",             tr: "Sipariş bulunamadı" },
  noLeads:              { en: "No leads yet",                tr: "Henüz potansiyel müşteri yok" },
  noCustomers:          { en: "No customers found",          tr: "Müşteri bulunamadı" },
  noProducts:           { en: "No products found",           tr: "Ürün bulunamadı" },
  noMatchFilters:       { en: "No records match the current filters.", tr: "Mevcut filtrelere uyan kayıt bulunamadı." },

  // ── Misc ─────────────────────────────────────────────────────────────────────
  loading:              { en: "Loading...",     tr: "Yükleniyor..." },
  notFound:             { en: "Not found",      tr: "Bulunamadı" },
  unknown:              { en: "Unknown",        tr: "Bilinmiyor" },
  total:                { en: "Total",          tr: "Toplam" },
  items:                { en: "items",          tr: "öğe" },
  records:              { en: "records",        tr: "kayıt" },
  notes:                { en: "Notes",          tr: "Notlar" },
  pool:                 { en: "Pool",           tr: "Havuz" },
  allocated:            { en: "Allocated",      tr: "Tahsis Edilen" },
  reserved:             { en: "Reserved",       tr: "Rezerve" },
  available:            { en: "Available",      tr: "Mevcut" },
  language:             { en: "Language",       tr: "Dil" },
} as const;

export type DictKey = keyof typeof dict;

/** Look up a translated string. Falls back to English if key missing. */
export function t(key: DictKey, lang: Lang): string {
  const entry = dict[key];
  if (!entry) return key;
  return entry[lang] ?? entry.en;
}
