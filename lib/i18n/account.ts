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
  newEmailLabel: string;
  confirmEmailLabel: string;
  secondFactorLabel: string;
  secondFactorHelp: string;
  secondFactorRequired: string;
  changeEmailWarning: string;
  changeEmail: string;
  changingEmail: string;
  emailRequired: string;
  emailInvalid: string;
  emailTooLong: string;
  emailSame: string;
  emailMismatch: string;
  emailChangeFailed: string;
  passwordDescription: string;
  passwordCredentialReady: string;
  passwordProviderOwned: string;
  currentPasswordLabel: string;
  newPasswordLabel: string;
  confirmPasswordLabel: string;
  passwordHelp: string;
  changePassword: string;
  changingPassword: string;
  passwordChanged: string;
  passwordRequired: string;
  passwordTooLong: string;
  newPasswordTooShort: string;
  newPasswordSame: string;
  passwordMismatch: string;
  passwordChangeFailed: string;
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
      "This sign-in email is managed by your connected provider. Cyfurden cannot change it or add a password credential.",
    newEmailLabel: "New sign-in email",
    confirmEmailLabel: "Confirm new email",
    secondFactorLabel: "Authenticator or recovery code",
    secondFactorHelp:
      "Enter the current six-digit authenticator code or one unused recovery code.",
    secondFactorRequired:
      "Enter the current authenticator code or one unused recovery code.",
    changeEmailWarning:
      "Changing email signs out every browser, marks the new address unverified, and leaves pending team invitations at their original addresses.",
    changeEmail: "Change email",
    changingEmail: "Changing email…",
    emailRequired: "Enter the new sign-in email in both fields.",
    emailInvalid: "Enter a complete email address, such as name@example.com.",
    emailTooLong: "Use an email address with 254 characters or fewer.",
    emailSame: "Enter an address different from the current sign-in email.",
    emailMismatch: "The two email entries do not match. Re-enter them.",
    emailChangeFailed:
      "The email was not changed. Check your credentials and try again.",
    passwordDescription:
      "Password controls depend on whether this account has a Cyfurden credential.",
    passwordCredentialReady: "This account has a Cyfurden password credential.",
    passwordProviderOwned:
      "This account signs in through a connected provider. Its password is managed there.",
    currentPasswordLabel: "Current password",
    newPasswordLabel: "New password",
    confirmPasswordLabel: "Confirm new password",
    passwordHelp: "Use 8–128 characters and choose a different password.",
    changePassword: "Change password",
    changingPassword: "Changing password…",
    passwordChanged:
      "Password changed. Other signed-in browsers were signed out.",
    passwordRequired: "Enter this password before continuing.",
    passwordTooLong: "Use 128 characters or fewer.",
    newPasswordTooShort: "Use at least 8 characters for the new password.",
    newPasswordSame: "Choose a password different from the current one.",
    passwordMismatch: "The two new-password entries do not match.",
    passwordChangeFailed:
      "The password was not changed. Check the current password and try again.",
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
    emailReadOnly:
      "Email đăng nhập này do nhà cung cấp đã kết nối quản lý. Cyfurden không thể đổi email hoặc thêm thông tin đăng nhập bằng mật khẩu.",
    newEmailLabel: "Email đăng nhập mới",
    confirmEmailLabel: "Nhập lại email mới",
    secondFactorLabel: "Mã xác thực hoặc mã khôi phục",
    secondFactorHelp:
      "Nhập mã sáu chữ số hiện tại hoặc một mã khôi phục chưa dùng.",
    secondFactorRequired:
      "Nhập mã xác thực hiện tại hoặc một mã khôi phục chưa dùng.",
    changeEmailWarning:
      "Đổi email sẽ đăng xuất mọi trình duyệt, đánh dấu địa chỉ mới là chưa xác minh và giữ nguyên địa chỉ của lời mời đội ngũ đang chờ.",
    changeEmail: "Đổi email",
    changingEmail: "Đang đổi email…",
    emailRequired: "Nhập email đăng nhập mới vào cả hai ô.",
    emailInvalid: "Nhập email đầy đủ, ví dụ ten@example.com.",
    emailTooLong: "Dùng địa chỉ email có tối đa 254 ký tự.",
    emailSame: "Nhập địa chỉ khác email đăng nhập hiện tại.",
    emailMismatch: "Hai email chưa khớp. Hãy nhập lại.",
    emailChangeFailed:
      "Chưa đổi được email. Hãy kiểm tra thông tin xác thực và thử lại.",
    passwordDescription:
      "Quyền quản lý mật khẩu phụ thuộc vào việc tài khoản có thông tin đăng nhập Cyfurden hay không.",
    passwordCredentialReady:
      "Tài khoản này có thông tin đăng nhập bằng mật khẩu Cyfurden.",
    passwordProviderOwned:
      "Tài khoản này đăng nhập qua nhà cung cấp đã kết nối. Mật khẩu do nhà cung cấp đó quản lý.",
    currentPasswordLabel: "Mật khẩu hiện tại",
    newPasswordLabel: "Mật khẩu mới",
    confirmPasswordLabel: "Nhập lại mật khẩu mới",
    passwordHelp: "Dùng 8–128 ký tự và chọn mật khẩu khác mật khẩu hiện tại.",
    changePassword: "Đổi mật khẩu",
    changingPassword: "Đang đổi mật khẩu…",
    passwordChanged:
      "Đã đổi mật khẩu. Các trình duyệt đăng nhập khác đã bị đăng xuất.",
    passwordRequired: "Nhập mật khẩu này để tiếp tục.",
    passwordTooLong: "Dùng tối đa 128 ký tự.",
    newPasswordTooShort: "Mật khẩu mới cần ít nhất 8 ký tự.",
    newPasswordSame: "Chọn mật khẩu khác mật khẩu hiện tại.",
    passwordMismatch: "Hai mật khẩu mới chưa khớp.",
    passwordChangeFailed:
      "Chưa đổi được mật khẩu. Hãy kiểm tra mật khẩu hiện tại và thử lại.",
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
