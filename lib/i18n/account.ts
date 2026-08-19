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
  twoFactorCredentialRequired: string;
  twoFactorCodeRequired: string;
  twoFactorCodeInvalid: string;
  twoFactorCurrentInvalid: string;
  twoFactorNewCodeInvalid: string;
  twoFactorChangeFailed: string;
  twoFactorPasswordHelp: string;
  twoFactorCodePlaceholder: string;
  twoFactorStarting: string;
  twoFactorEnable: string;
  twoFactorEnableTitle: string;
  twoFactorEnableBody: string;
  twoFactorScanTitle: string;
  twoFactorScanBody: string;
  twoFactorQrAlt: string;
  twoFactorSetupKey: string;
  twoFactorSetupExpires: string;
  twoFactorNewCodeLabel: string;
  twoFactorNewCodeHelp: string;
  twoFactorConfirm: string;
  twoFactorVerifying: string;
  cancel: string;
  twoFactorResyncTitle: string;
  twoFactorResyncBody: string;
  twoFactorResync: string;
  twoFactorResynced: string;
  twoFactorDisableTitle: string;
  twoFactorDisableBody: string;
  twoFactorDisableConfirmation: string;
  twoFactorDisableConfirmationRequired: string;
  twoFactorDisableWarning: string;
  twoFactorDisable: string;
  twoFactorDisabling: string;
  twoFactorDisabledSuccess: string;
  twoFactorEnabledSuccess: string;
  twoFactorPlatformRefreshNote: string;
  twoFactorVerifyPlatform: string;
  twoFactorPlatformEnableRequired: string;
  twoFactorRecoveryTitle: string;
  twoFactorRecoveryBody: string;
  twoFactorRecoverySaved: string;
  twoFactorRecoveryPending: string;
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
    twoFactorCredentialRequired:
      "Authenticator controls require an email-and-password sign-in method. Your connected provider remains the sign-in authority for this account.",
    twoFactorCodeRequired:
      "Enter the current authenticator code or one unused recovery code.",
    twoFactorCodeInvalid:
      "Use a six-digit authenticator code or a recovery code in XXXXX-XXXXX format.",
    twoFactorCurrentInvalid:
      "The current authenticator or recovery code was not accepted. Try a fresh code.",
    twoFactorNewCodeInvalid:
      "The new authenticator code was not accepted. Check the setup and try a fresh six-digit code.",
    twoFactorChangeFailed:
      "Authenticator settings were not changed. Check the credentials and try again.",
    twoFactorPasswordHelp:
      "Enter the current Cyfurden password for this account.",
    twoFactorCodePlaceholder: "123456 or ABCDE-FGHIJ",
    twoFactorStarting: "Preparing…",
    twoFactorEnable: "Set up authenticator",
    twoFactorEnableTitle: "Add an authenticator",
    twoFactorEnableBody:
      "Confirm the current password before Cyfurden creates a private, ten-minute setup.",
    twoFactorScanTitle: "Connect the new authenticator",
    twoFactorScanBody:
      "Scan this code in an authenticator app, or enter the setup key manually. The account is unchanged until the new code is confirmed.",
    twoFactorQrAlt: "QR code for the pending Cyfurden authenticator setup",
    twoFactorSetupKey: "Manual setup key",
    twoFactorSetupExpires: "This private setup expires after ten minutes.",
    twoFactorNewCodeLabel: "Code from the new authenticator",
    twoFactorNewCodeHelp:
      "Enter the current six-digit code from the authenticator you just connected.",
    twoFactorConfirm: "Confirm authenticator",
    twoFactorVerifying: "Verifying…",
    cancel: "Cancel",
    twoFactorResyncTitle: "Replace the authenticator",
    twoFactorResyncBody:
      "Verify the password and current factor first. The existing authenticator and recovery codes keep working until the replacement is confirmed.",
    twoFactorResync: "Start replacement",
    twoFactorResynced:
      "Authenticator replaced. Other signed-in browsers were signed out.",
    twoFactorDisableTitle: "Remove authenticator protection",
    twoFactorDisableBody:
      "Removal deletes this factor and every remaining recovery code, then signs out other browsers.",
    twoFactorDisableConfirmation:
      "I understand that this deletes the authenticator and recovery codes.",
    twoFactorDisableConfirmationRequired:
      "Confirm that the authenticator and recovery codes will be deleted.",
    twoFactorDisableWarning:
      "You will need the password alone for the next sign-in.",
    twoFactorDisable: "Disable authenticator",
    twoFactorDisabling: "Disabling…",
    twoFactorDisabledSuccess:
      "Authenticator protection is disabled. Other signed-in browsers were signed out.",
    twoFactorEnabledSuccess: "Authenticator protection is now enabled.",
    twoFactorPlatformRefreshNote:
      "This platform session still needs a current authenticator check.",
    twoFactorVerifyPlatform: "Verify platform access",
    twoFactorPlatformEnableRequired:
      "Authenticator protection must be enabled before platform access can be verified.",
    twoFactorRecoveryTitle: "Save the new recovery codes",
    twoFactorRecoveryBody:
      "Each code works once. Store them somewhere private now; Cyfurden will not show this set again.",
    twoFactorRecoverySaved: "I saved these codes",
    twoFactorRecoveryPending:
      "Authenticator connected. Save the new recovery codes to finish.",
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
    twoFactorCredentialRequired:
      "Tùy chọn ứng dụng xác thực cần phương thức đăng nhập bằng email và mật khẩu. Nhà cung cấp đã kết nối vẫn quản lý đăng nhập của tài khoản này.",
    twoFactorCodeRequired:
      "Nhập mã xác thực hiện tại hoặc một mã khôi phục chưa dùng.",
    twoFactorCodeInvalid:
      "Dùng mã xác thực sáu chữ số hoặc mã khôi phục theo dạng XXXXX-XXXXX.",
    twoFactorCurrentInvalid:
      "Mã xác thực hoặc mã khôi phục hiện tại không được chấp nhận. Hãy thử mã mới.",
    twoFactorNewCodeInvalid:
      "Mã từ ứng dụng xác thực mới không được chấp nhận. Hãy kiểm tra thiết lập và thử mã sáu chữ số mới.",
    twoFactorChangeFailed:
      "Chưa thay đổi tùy chọn ứng dụng xác thực. Hãy kiểm tra thông tin xác thực và thử lại.",
    twoFactorPasswordHelp: "Nhập mật khẩu Cyfurden hiện tại của tài khoản.",
    twoFactorCodePlaceholder: "123456 hoặc ABCDE-FGHIJ",
    twoFactorStarting: "Đang chuẩn bị…",
    twoFactorEnable: "Thiết lập ứng dụng xác thực",
    twoFactorEnableTitle: "Thêm ứng dụng xác thực",
    twoFactorEnableBody:
      "Xác nhận mật khẩu hiện tại trước khi Cyfurden tạo một thiết lập riêng tư có hiệu lực trong mười phút.",
    twoFactorScanTitle: "Kết nối ứng dụng xác thực mới",
    twoFactorScanBody:
      "Quét mã này trong ứng dụng xác thực hoặc nhập khóa thiết lập. Tài khoản chưa thay đổi cho đến khi mã mới được xác nhận.",
    twoFactorQrAlt: "Mã QR cho thiết lập ứng dụng xác thực Cyfurden đang chờ",
    twoFactorSetupKey: "Khóa thiết lập thủ công",
    twoFactorSetupExpires: "Thiết lập riêng tư này hết hạn sau mười phút.",
    twoFactorNewCodeLabel: "Mã từ ứng dụng xác thực mới",
    twoFactorNewCodeHelp:
      "Nhập mã sáu chữ số hiện tại từ ứng dụng xác thực bạn vừa kết nối.",
    twoFactorConfirm: "Xác nhận ứng dụng xác thực",
    twoFactorVerifying: "Đang xác minh…",
    cancel: "Hủy",
    twoFactorResyncTitle: "Thay ứng dụng xác thực",
    twoFactorResyncBody:
      "Xác minh mật khẩu và yếu tố hiện tại trước. Ứng dụng xác thực và mã khôi phục cũ vẫn hoạt động cho đến khi xác nhận bản thay thế.",
    twoFactorResync: "Bắt đầu thay thế",
    twoFactorResynced:
      "Đã thay ứng dụng xác thực. Các trình duyệt đăng nhập khác đã bị đăng xuất.",
    twoFactorDisableTitle: "Gỡ bảo vệ bằng ứng dụng xác thực",
    twoFactorDisableBody:
      "Thao tác này xóa yếu tố xác thực và mọi mã khôi phục còn lại, rồi đăng xuất các trình duyệt khác.",
    twoFactorDisableConfirmation:
      "Tôi hiểu rằng ứng dụng xác thực và mã khôi phục sẽ bị xóa.",
    twoFactorDisableConfirmationRequired:
      "Xác nhận rằng ứng dụng xác thực và mã khôi phục sẽ bị xóa.",
    twoFactorDisableWarning: "Lần đăng nhập tiếp theo sẽ chỉ cần mật khẩu.",
    twoFactorDisable: "Tắt ứng dụng xác thực",
    twoFactorDisabling: "Đang tắt…",
    twoFactorDisabledSuccess:
      "Đã tắt bảo vệ bằng ứng dụng xác thực. Các trình duyệt đăng nhập khác đã bị đăng xuất.",
    twoFactorEnabledSuccess: "Đã bật bảo vệ bằng ứng dụng xác thực.",
    twoFactorPlatformRefreshNote:
      "Phiên nền tảng này vẫn cần kiểm tra ứng dụng xác thực hiện tại.",
    twoFactorVerifyPlatform: "Xác minh quyền nền tảng",
    twoFactorPlatformEnableRequired:
      "Cần bật bảo vệ bằng ứng dụng xác thực trước khi xác minh quyền nền tảng.",
    twoFactorRecoveryTitle: "Lưu mã khôi phục mới",
    twoFactorRecoveryBody:
      "Mỗi mã chỉ dùng một lần. Hãy lưu chúng ở nơi riêng tư ngay bây giờ; Cyfurden sẽ không hiển thị lại bộ mã này.",
    twoFactorRecoverySaved: "Tôi đã lưu các mã này",
    twoFactorRecoveryPending:
      "Đã kết nối ứng dụng xác thực. Hãy lưu mã khôi phục mới để hoàn tất.",
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
