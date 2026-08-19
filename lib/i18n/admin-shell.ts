import { parseLocale, type Locale } from "./locales";

export type AdminShellStrings = {
  metadataTitle: string;
  brandSubline: string;
  workspaceLabel: string;
  storefrontLabel: string;
  storefrontDescription: string;
  ordersLabel: string;
  ordersDescription: string;
  productsLabel: string;
  productsDescription: string;
  promotionsLabel: string;
  promotionsDescription: string;
  faceboothLabel: string;
  faceboothMobileLabel: string;
  faceboothDescription: string;
  gachaLabel: string;
  gachaDescription: string;
  teamLabel: string;
  teamDescription: string;
  viewStorefront: string;
  allBooths: string;
  privateChangesHint: string;
  activeBooth: (role: string) => string;
  roleWorkspace: (role: string) => string;
  switchBooth: string;
  currentBooth: string;
  createBooth: string;
  moreActions: string;
  boothWorkspaceAria: string;
  boothManagementAria: string;
  language: string;
  account: string;
  settings: string;
  settingsDescription: string;
  alerts: string;
  alertsOn: string;
  alertsOff: string;
  alertsBrowserBlocked: string;
  alertsUnsupported: string;
  signOut: string;
  signingOut: string;
  accountDescription: string;
  productsCount: (count: number) => string;
  suspendedTitle: string;
  suspendedBody: string;
  deletionPendingTitle: string;
  deletionPendingBody: string;
  privateServiceReason: string;
};

const roleNames: Record<Locale, Record<string, string>> = {
  en: {
    OWNER: "owner",
    ADMIN: "admin",
    STAFF: "staff",
  },
  vi: {
    OWNER: "chủ booth",
    ADMIN: "quản trị",
    STAFF: "nhân viên",
  },
};

const catalogues: Record<Locale, AdminShellStrings> = {
  en: {
    metadataTitle: "Booth management",
    brandSubline: "Artist booth studio",
    workspaceLabel: "Workspace",
    storefrontLabel: "Storefront",
    storefrontDescription: "Edit public presentation",
    ordersLabel: "Orders",
    ordersDescription: "Review and prepare reservations",
    productsLabel: "Products",
    productsDescription: "Manage catalogue and stock",
    promotionsLabel: "Promotions",
    promotionsDescription: "Manage quantity offers",
    faceboothLabel: "Facebooth",
    faceboothMobileLabel: "Studio",
    faceboothDescription: "Design standees and booth layouts",
    gachaLabel: "Gacha",
    gachaDescription: "Configure free play",
    teamLabel: "Team",
    teamDescription: "Members and access",
    viewStorefront: "View storefront",
    allBooths: "All booths",
    privateChangesHint:
      "Changes stay private until you publish the storefront.",
    activeBooth: (role) =>
      `Active booth · ${roleNames.en[role.toUpperCase()] ?? role.toLowerCase()}`,
    roleWorkspace: (role) =>
      `${roleNames.en[role.toUpperCase()] ?? role.toLowerCase()} workspace`,
    switchBooth: "Switch booth",
    currentBooth: "Current booth",
    createBooth: "Create another booth",
    moreActions: "More workspace actions",
    boothWorkspaceAria: "Booth workspace",
    boothManagementAria: "Booth management",
    language: "Language",
    account: "Account",
    settings: "Settings",
    settingsDescription: "Booth details and payment",
    alerts: "Order alerts",
    alertsOn: "On · sound and visual",
    alertsOff: "Off · enable on this device",
    alertsBrowserBlocked: "Browser notifications blocked",
    alertsUnsupported: "Browser notifications unavailable",
    signOut: "Sign out",
    signingOut: "Signing out…",
    accountDescription: "Cyfurden account",
    productsCount: (count) =>
      `${count} ${count === 1 ? "product" : "products"}`,
    suspendedTitle: "Booth suspended · read-only workspace",
    suspendedBody:
      "Platform operations suspended this booth. Existing members can review private records, but public access and every mutation are disabled.",
    deletionPendingTitle: "Booth deletion pending · read-only workspace",
    deletionPendingBody:
      "This booth is in its cooling-off or finalization workflow. Existing members can review private records, but public access and every mutation are disabled.",
    privateServiceReason: "Private operator reason",
  },
  vi: {
    metadataTitle: "Quản lý booth",
    brandSubline: "Studio booth cho nghệ sĩ",
    workspaceLabel: "Không gian làm việc",
    storefrontLabel: "Storefront",
    storefrontDescription: "Chỉnh giao diện công khai",
    ordersLabel: "Đơn hàng",
    ordersDescription: "Duyệt và chuẩn bị đơn đặt trước",
    productsLabel: "Sản phẩm",
    productsDescription: "Quản lý danh mục và tồn kho",
    promotionsLabel: "Ưu đãi",
    promotionsDescription: "Quản lý khuyến mãi số lượng",
    faceboothLabel: "Facebooth",
    faceboothMobileLabel: "Studio",
    faceboothDescription: "Thiết kế standee và bố cục booth",
    gachaLabel: "Gacha",
    gachaDescription: "Cấu hình lượt chơi miễn phí",
    teamLabel: "Đội ngũ",
    teamDescription: "Thành viên và quyền truy cập",
    viewStorefront: "Xem storefront",
    allBooths: "Tất cả booth",
    privateChangesHint:
      "Thay đổi vẫn ở chế độ riêng tư cho đến khi bạn xuất bản storefront.",
    activeBooth: (role) =>
      `Booth hiện tại · ${roleNames.vi[role.toUpperCase()] ?? role.toLowerCase()}`,
    roleWorkspace: (role) =>
      `Không gian ${roleNames.vi[role.toUpperCase()] ?? role.toLowerCase()}`,
    switchBooth: "Chuyển booth",
    currentBooth: "Booth hiện tại",
    createBooth: "Tạo booth khác",
    moreActions: "Thêm thao tác",
    boothWorkspaceAria: "Không gian làm việc của booth",
    boothManagementAria: "Quản lý booth",
    language: "Ngôn ngữ",
    account: "Tài khoản",
    settings: "Cài đặt",
    settingsDescription: "Thông tin booth và thanh toán",
    alerts: "Báo đơn mới",
    alertsOn: "Bật · âm thanh và hiển thị",
    alertsOff: "Tắt · bật trên thiết bị này",
    alertsBrowserBlocked: "Thông báo trình duyệt đã bị chặn",
    alertsUnsupported: "Trình duyệt không hỗ trợ thông báo",
    signOut: "Đăng xuất",
    signingOut: "Đang đăng xuất…",
    accountDescription: "Tài khoản Cyfurden",
    productsCount: (count) => `${count} sản phẩm`,
    suspendedTitle: "Booth đã tạm ngưng · chỉ có quyền xem",
    suspendedBody:
      "Bộ phận vận hành nền tảng đã tạm ngưng booth này. Thành viên hiện tại vẫn có thể xem dữ liệu riêng tư, nhưng truy cập công khai và mọi thay đổi đều bị khóa.",
    deletionPendingTitle: "Booth đang chờ xóa · chỉ có quyền xem",
    deletionPendingBody:
      "Booth này đang trong thời gian chờ hoặc quy trình hoàn tất xóa. Thành viên hiện tại vẫn có thể xem dữ liệu riêng tư, nhưng truy cập công khai và mọi thay đổi đều bị khóa.",
    privateServiceReason: "Lý do vận hành riêng tư",
  },
};

export function getAdminShellStrings(
  locale: Locale | string | undefined,
): AdminShellStrings {
  return catalogues[parseLocale(locale)];
}
