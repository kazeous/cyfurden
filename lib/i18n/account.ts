import { parseLocale, type Locale } from "./locales";

export type AccountStrings = {
  metadataTitle: string;
  metadataDescription: string;
  brandAria: string;
  brandSubline: string;
  backDashboard: string;
  language: string;
  pageTitle: string;
  pageDescription: string;
  signedInAs: string;
  sectionNavigation: string;
  sections: {
    profile: string;
    email: string;
    password: string;
    twoFactor: string;
  };
  profileDescription: string;
  displayNameLabel: string;
  displayNameHelp: string;
  saveName: string;
  savingName: string;
  nameSaved: string;
  nameRequired: string;
  nameLength: string;
  nameTooLong: string;
  nameSaveFailed: string;
  emailDescription: string;
  currentEmail: string;
  emailVerified: string;
  emailUnverified: string;
  signInMethods: string;
  emailReadOnly: string;
  passwordDescription: string;
  passwordCredentialReady: string;
  passwordProviderOwned: string;
  passwordReadOnly: string;
  twoFactorDescription: string;
  twoFactorEnabled: string;
  twoFactorDisabled: string;
  twoFactorPlatformConstraint: string;
  manageTwoFactor: string;
  providerCredential: string;
  providerGoogle: string;
  providerOther: (provider: string) => string;
};

const catalogues: Record<Locale, AccountStrings> = {
  en: {
    metadataTitle: "Your account",
    metadataDescription:
      "Review your Cyfurden sign-in identity and account security.",
    brandAria: "Cyfurden home",
    brandSubline: "Personal account",
    backDashboard: "Booth dashboard",
    language: "Language",
    pageTitle: "Your account",
    pageDescription:
      "One place for the name shown across Cyfurden and the sign-in methods that protect your work.",
    signedInAs: "Signed in as",
    sectionNavigation: "Account sections",
    sections: {
      profile: "Profile",
      email: "Email",
      password: "Password",
      twoFactor: "Two-factor authentication",
    },
    profileDescription:
      "This display name appears in your booth dashboard and private workspaces. It does not rename a booth or rewrite past orders.",
    displayNameLabel: "Display name",
    displayNameHelp:
      "Use 2–80 visible characters. Extra spaces are removed when you save.",
    saveName: "Save display name",
    savingName: "Saving…",
    nameSaved: "Display name saved across your signed-in workspaces.",
    nameRequired: "Enter the name you want Cyfurden to show.",
    nameLength: "Use between 2 and 80 visible characters.",
    nameTooLong: "Shorten this name, then save it again.",
    nameSaveFailed: "The display name was not saved. Check it and try again.",
    emailDescription:
      "This is the address Cyfurden currently uses for sign-in and team invitations.",
    currentEmail: "Current sign-in email",
    emailVerified: "Verified",
    emailUnverified: "Not verified",
    signInMethods: "Sign-in methods",
    emailReadOnly:
      "Email changes are not available in this account workspace yet.",
    passwordDescription:
      "Password controls depend on whether this account has a Cyfurden credential.",
    passwordCredentialReady: "This account has a Cyfurden password credential.",
    passwordProviderOwned:
      "This account signs in through a connected provider. Its password is managed there.",
    passwordReadOnly:
      "Password changes are not available in this account workspace yet.",
    twoFactorDescription:
      "An authenticator app adds a second check to password sign-in and protected platform work.",
    twoFactorEnabled: "Authenticator protection is enabled.",
    twoFactorDisabled: "Authenticator protection is not enabled.",
    twoFactorPlatformConstraint:
      "An active platform role requires authenticator protection and prevents it from being disabled.",
    manageTwoFactor: "Open authenticator controls",
    providerCredential: "Email and password",
    providerGoogle: "Google",
    providerOther: (provider) => provider,
  },
  vi: {
    metadataTitle: "Tài khoản của bạn",
    metadataDescription:
      "Xem danh tính đăng nhập và bảo mật tài khoản Cyfurden.",
    brandAria: "Trang chủ Cyfurden",
    brandSubline: "Tài khoản cá nhân",
    backDashboard: "Bảng booth",
    language: "Ngôn ngữ",
    pageTitle: "Tài khoản của bạn",
    pageDescription:
      "Một nơi để quản lý tên hiển thị trên Cyfurden và các phương thức đăng nhập bảo vệ công việc của bạn.",
    signedInAs: "Đang đăng nhập với",
    sectionNavigation: "Các mục tài khoản",
    sections: {
      profile: "Hồ sơ",
      email: "Email",
      password: "Mật khẩu",
      twoFactor: "Xác thực hai bước",
    },
    profileDescription:
      "Tên này xuất hiện trong bảng booth và không gian làm việc riêng tư. Thay đổi không đổi tên booth hoặc sửa đơn hàng cũ.",
    displayNameLabel: "Tên hiển thị",
    displayNameHelp:
      "Dùng 2–80 ký tự hiển thị. Khoảng trắng thừa sẽ được bỏ khi lưu.",
    saveName: "Lưu tên hiển thị",
    savingName: "Đang lưu…",
    nameSaved: "Đã lưu tên hiển thị trong các không gian bạn đăng nhập.",
    nameRequired: "Nhập tên bạn muốn Cyfurden hiển thị.",
    nameLength: "Dùng từ 2 đến 80 ký tự hiển thị.",
    nameTooLong: "Rút gọn tên này rồi lưu lại.",
    nameSaveFailed: "Chưa lưu được tên hiển thị. Hãy kiểm tra và thử lại.",
    emailDescription:
      "Đây là địa chỉ Cyfurden hiện dùng để đăng nhập và nhận lời mời đội ngũ.",
    currentEmail: "Email đăng nhập hiện tại",
    emailVerified: "Đã xác minh",
    emailUnverified: "Chưa xác minh",
    signInMethods: "Phương thức đăng nhập",
    emailReadOnly: "Hiện chưa thể đổi email trong không gian tài khoản này.",
    passwordDescription:
      "Quyền quản lý mật khẩu phụ thuộc vào việc tài khoản có thông tin đăng nhập Cyfurden hay không.",
    passwordCredentialReady:
      "Tài khoản này có thông tin đăng nhập bằng mật khẩu Cyfurden.",
    passwordProviderOwned:
      "Tài khoản này đăng nhập qua nhà cung cấp đã kết nối. Mật khẩu do nhà cung cấp đó quản lý.",
    passwordReadOnly:
      "Hiện chưa thể đổi mật khẩu trong không gian tài khoản này.",
    twoFactorDescription:
      "Ứng dụng xác thực thêm một bước kiểm tra cho đăng nhập bằng mật khẩu và thao tác nền tảng được bảo vệ.",
    twoFactorEnabled: "Bảo vệ bằng ứng dụng xác thực đang bật.",
    twoFactorDisabled: "Bảo vệ bằng ứng dụng xác thực chưa bật.",
    twoFactorPlatformConstraint:
      "Vai trò nền tảng đang hoạt động yêu cầu ứng dụng xác thực và không cho phép tắt tính năng này.",
    manageTwoFactor: "Mở tùy chọn ứng dụng xác thực",
    providerCredential: "Email và mật khẩu",
    providerGoogle: "Google",
    providerOther: (provider) => provider,
  },
};

export function getAccountStrings(
  locale: Locale | string | undefined,
): AccountStrings {
  return catalogues[parseLocale(locale)];
}
