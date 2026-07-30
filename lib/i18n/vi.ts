import type { Catalogue } from "./catalogue";

const pluralItems = (count: number) =>
  count === 1 ? "1 sản phẩm" : `${count} sản phẩm`;

export const viCatalogue: Catalogue = {
  publicBooth: {
    boothInfoEyebrow: "Thông tin booth",
    boothInfoTitle: "Về booth",
    boothInfoOpen: "Thông tin booth",
    boothInfoClose: "Đóng thông tin booth",
    boothGuideEyebrow: "Hướng dẫn booth",
    boothSideCta: "Điểm nhấn booth",
    featuredEyebrow: "Nổi bật",
    featuredTitle: "Những món được chọn riêng",
    featuredSeeAll: "Xem món này",
    featuredProductEyebrow: "Nổi bật",
    featuredSeeItem: "Xem chi tiết món",
    featuredCarouselA11y: {
      landmark: "Băng chuyền món nổi bật",
      slidePosition: (current, total) => `Trang ${current} / ${total}`,
      prev: "Món nổi bật trước",
      next: "Món nổi bật tiếp theo",
      dots: "Phân trang món nổi bật",
      slide: (name) => `Trang nổi bật cho ${name}`,
      artButton: (name) => `Xem chi tiết cho ${name}`,
    },
    browseEyebrow: "Duyệt nhanh",
    browseTitle: "Tìm một món nhỏ xinh",
    browseEmpty:
      "Chưa có kết quả — thử từ khoá khác hoặc chọn danh mục khác nhé.",
    browseSearchPlaceholder: "Tìm sản phẩm, tag, mô tả",
    browseAllLabel: "Tất cả",
    browseSortAria: "Sắp xếp sản phẩm",
    browseSortFeatured: "Nổi bật",
    browseSortNewest: "Mới nhất",
    browseSortPriceAsc: "Giá: thấp đến cao",
    browseSortPriceDesc: "Giá: cao đến thấp",
    browseSortName: "Tên",
    browseViewAria: "Đổi kiểu hiển thị",
    browseViewGrid: "Hiển thị lưới",
    browseViewList: "Hiển thị danh sách",
    creatorProfilesAria: "Hồ sơ nghệ sĩ",
    catalogueEyebrow: "Bộ sưu tập",
    catalogueTitle: "Tìm một món nhỏ xinh",
    catalogueEmpty: "Chưa có sản phẩm nào để hiển thị.",
    catalogueEmptyHeading: "Chưa có sản phẩm phù hợp",
    catalogueEmptyHint: "Thử chọn danh mục khác hoặc xoá từ khoá tìm kiếm.",
    newReleaseEyebrow: "Mới ra mắt",
    featuredBadge: "Nổi bật",
    cartEyebrow: "Giỏ hàng",
    cartTitleEmpty: "Giỏ của bạn đang trống",
    cartTitleItems: (count) => pluralItems(count),
    cartReadyForReservation: (amount) =>
      `${amount} sẵn sàng để đặt trước thủ công.`,
    cartEmptyHint: "Chọn một món từ bộ sưu tập để bắt đầu.",
    cartReview: "Xem giỏ",
    cartOpen: "Mở giỏ",
    cartManualNote: "Chuyển khoản thủ công · không xác minh tự động",
    cartPausedNote:
      "Tạm dừng nhận đặt trước cho đến khi cấu hình thanh toán xong",
    cartDisclaimer:
      "Thanh toán bằng chuyển khoản thủ công — không xác minh tự động.",
    topbarBag: "Giỏ",
    productDetailEyebrow: "Chi tiết sản phẩm",
    productDetailChooseOption: "Chọn một tuỳ chọn",
    productDetailOptionLabel: "Tuỳ chọn",
    productDetailUnavailable: " — không khả dụng",
    productDetailAvailabilitySoldOut: "Đã hết hàng",
    productDetailAvailabilityLeft: (n) => `Còn ${n}`,
    productDetailAvailabilityPreorder: "Đặt trước",
    productDetailAvailabilityAvailable: "Còn hàng",
    productDetailAddToBag: "Thêm vào giỏ",
    productDetailSoldOut: "Đã hết hàng",
    productDetailReservationsPaused: "Tạm dừng nhận đặt trước",
    productDetailStockLimitReached: "Đã đạt giới hạn tồn kho",
    productDetailDetails: "Chi tiết",
    productDetailClose: "Đóng chi tiết sản phẩm",
    productDetailRemoveOne: "Bớt một",
    productDetailAddOne: "Thêm một",
    productDetailImagesAria: "Hình ảnh sản phẩm",
    productDetailShowImage: (n) => `Xem hình ${n}`,
    productDetailDisclaimer:
      "Màu sắc thực tế có thể chênh lệch nhẹ so với hình.",
    cartFooter:
      "Sau khi gửi, bạn sẽ nhận hướng dẫn chuyển khoản thủ công. Cyfurden không tự xác minh thanh toán.",
    cartLineRemove: (name, variant) => `Xoá ${name}, ${variant}, khỏi giỏ`,
    cartLineRemoveOne: (name) => `Bớt một ${name}`,
    cartLineAddOne: (name) => `Thêm một ${name}`,
    cartLineAvailable: (n) => `Còn ${n}`,
    cartLineUnits: (n) => `${n} sản phẩm đã chọn`,
    promotionProgress: (name, remaining) =>
      `${name}: thêm ${remaining} sản phẩm đủ điều kiện để mở khoá quà tặng.`,
    promotionRewardReady: (name, quantity) =>
      `${name} đã mở khoá — thêm ${quantity} sản phẩm quà tặng hợp lệ.`,
    promotionApplied: (name, quantity, savings) =>
      `${name}: miễn phí ${quantity} sản phẩm quà tặng. Bạn tiết kiệm ${savings}.`,
    promotionAppliedRepeatable: (name, quantity, savings, remaining) =>
      `${name}: miễn phí ${quantity} sản phẩm quà tặng, tiết kiệm ${savings}. Thêm ${remaining} sản phẩm đủ điều kiện cho lượt quà tiếp theo.`,
    promotionFreeUnits: (quantity) =>
      `${quantity} sản phẩm miễn phí theo ưu đãi`,
    cartSubtotalLabel: "Tạm tính",
    cartPromotionSavingsLabel: "Tiết kiệm từ ưu đãi",
    cartTotalLabel: "Tổng cộng",
    cartTotalUnits: "sản phẩm đã chọn",
    cartClear: "Xoá giỏ",
    cartClearedAnnouncement: "Đã xoá toàn bộ giỏ.",
    cartLineRemovedAnnouncement: (name, variant) =>
      `Đã xoá ${name}, ${variant}, khỏi giỏ.`,
    cartClose: "Đóng giỏ",
    bagHeading: "Giỏ của bạn",
    cartSubmit: "Đặt trước các món này",
    cartSubmitPending: "Đang lưu đặt trước…",
    cartNameLabel: "Tên của bạn",
    cartEmailLabel: "Email",
    cartPhoneLabel: "Số điện thoại (tuỳ chọn)",
    cartNoteLabel: "Ghi chú cho booth (tuỳ chọn)",
    cartNamePlaceholder: "Tên trên đơn đặt trước",
    cartEmailPlaceholder: "ten@example.com",
    cartPhonePlaceholder: "Số liên lạc (tuỳ chọn)",
    cartNotePlaceholder: "Có gì cần lưu ý không?",
    cartSubmitErrorRequired: "Vui lòng nhập tên và email.",
    cartSubmitErrorInvalidEmail: "Email chưa đúng định dạng, kiểm tra lại nhé.",
    cartSubmitErrorGeneric:
      "Chưa lưu được đặt trước. Vui lòng thử lại sau ít phút.",
    cartActionBagUnreadable:
      "Không đọc được dữ liệu trong giỏ. Hãy tải lại storefront và thêm lại sản phẩm.",
    cartActionInvalidSubmission:
      "Kiểm tra thông tin liên hệ và số lượng trong giỏ, rồi gửi lại đặt trước.",
    cartActionInvalidQuantity: "Giỏ có số lượng sản phẩm không hợp lệ.",
    cartActionStorefrontUnavailable:
      "Storefront này hiện không nhận đặt trước.",
    cartActionPaymentUnavailable:
      "Booth chưa hoàn tất hướng dẫn thanh toán nên tạm thời chưa thể nhận đặt trước.",
    cartActionItemUnavailable:
      "Một sản phẩm không còn khả dụng. Hãy tải lại booth và thử lại.",
    cartActionItemNotFound: "Không tìm thấy một sản phẩm trong booth này.",
    cartActionStockUnavailable: (name, quantity) =>
      `${name} không còn đủ ${quantity} sản phẩm. Hãy tải lại booth để xem tồn kho mới nhất.`,
    cartActionInvalidPrice:
      "Một sản phẩm có giá không hợp lệ nên chưa thể đặt trước.",
    cartActionSaveFailed:
      "Chưa lưu được đặt trước. Giỏ hàng vẫn còn đây; đợi một chút rồi thử lại.",
    cartActionStockChanged:
      "Tồn kho đã thay đổi trong lúc lưu đặt trước. Hãy tải lại booth và thử lại.",
    bagFootnote: "Chuyển khoản thủ công · không xác minh tự động",
    publicFooterManual: "Chuyển khoản thủ công · không xác minh tự động",
    reservationPending: "Đang chờ bạn chuyển khoản",
    reservationConfirmed: "Booth đã xác nhận chuyển khoản",
    reservationFulfilled: "Đã giao",
    reservationCancelled: "Booth đã huỷ",
    reservationExpired: "Đơn đặt trước đã hết hạn",
    reservationReferenceLabel: "Mã đặt trước",
    reservationItemsHeading: "Danh sách món",
    reservationItemLine: (title, qty, price) => `${title} · ${qty} × ${price}`,
    reservationItemTotal: "Thành tiền dòng",
    reservationAmountLabel: "Số tiền cần chuyển",
    reservationAmountLabelValue: (amount) => `${amount}`,
    reservationTransferMessageLabel: "Nội dung chuyển khoản",
    reservationCustomerReferenceLabel: "Mã tham chiếu phía bạn",
    reservationCustomerReferenceMissing: "Chưa gửi",
    reservationBankNameLabel: "Ngân hàng nhận",
    reservationAccountNameLabel: "Tên tài khoản",
    reservationAccountNumberLabel: "Số tài khoản",
    reservationPaymentLabelLabel: "Nhãn thanh toán",
    reservationQrCaption: "Quét để chuyển khoản",
    reservationQrCaptionGenerated: "Tạo riêng cho đơn này",
    reservationQrCaptionBooth: "QR do booth cung cấp",
    reservationInstructionsHeading: "Hướng dẫn chuyển khoản",
    reservationDisclaimerHeading: "Lưu ý về xác minh thủ công",
    reservationStorefrontLink: "Mở booth",
    reservationBackToStore: "Quay lại booth",
    socialHeading: "Theo dõi nghệ sĩ",
    socialOpenProfile: "Mở trang cá nhân",
    socialQrAlt: (label) => `Mã QR trang ${label}`,
    tagAriaLabel: "Thẻ",
    infoSocialsHeading: "Mạng xã hội của booth",
  },
  publicReservation: {
    pageTitle: "Đã nhận đặt trước",
    pageDescription: "Mã đặt trước và hướng dẫn chuyển khoản thủ công.",
    notFoundTitle: "Không tìm thấy đặt trước",
    notFoundBody:
      "Chưa tìm thấy đơn này. Kiểm tra lại đường link trong email xác nhận nhé.",
    notFoundAction: "Mở booth",
    backToBooth: "Quay lại booth",
    receiptEyebrow: "Biên nhận đặt trước",
    referenceCaption: "Lưu mã này — booth sẽ hỏi để đối chiếu.",
    copy: "Sao chép",
    copied: "Đã sao chép",
    copyNumber: "Sao chép số tài khoản",
    copyAccount: "Sao chép tên tài khoản",
    copyReference: "Sao chép mã tham chiếu",
    copyError: "Sao chép thất bại",
    copySuccess: (target) => `Đã sao chép ${target}`,
    statusBlocks: (status) => {
      const blocks: Record<
        "PENDING" | "CONFIRMED" | "FULFILLED" | "CANCELLED" | "EXPIRED",
        { heading: string; description: string; label: string }
      > = {
        PENDING: {
          heading: "Đang chờ bạn chuyển khoản",
          description:
            "Chuyển đúng số tiền vào tài khoản bên dưới và ghi mã tham chiếu. Booth sẽ xác nhận thủ công.",
          label: "Đang chờ bạn chuyển khoản",
        },
        CONFIRMED: {
          heading: "Đã xác nhận chuyển khoản",
          description:
            "Booth đã xác nhận chuyển khoản. Chờ thông báo giao hàng tiếp theo.",
          label: "Đã xác nhận chuyển khoản",
        },
        FULFILLED: {
          heading: "Đã hoàn tất đơn",
          description: "Món của bạn đã sẵn sàng. Đến booth nhận nhé.",
          label: "Đã hoàn tất đơn",
        },
        CANCELLED: {
          heading: "Đơn đã bị huỷ",
          description:
            "Đơn này đã được booth huỷ. Liên hệ nếu bạn cho rằng đây là nhầm lẫn.",
          label: "Booth đã huỷ",
        },
        EXPIRED: {
          heading: "Đơn đặt trước đã hết hạn",
          description: "Đơn này đã hết hạn. Hãy đặt lại từ booth nhé.",
          label: "Đơn đặt trước đã hết hạn",
        },
      };
      return blocks[status];
    },
    paymentLabelFallback: "Đơn đặt trước chưa đặt tên",
    paymentHeading: "Chuyển khoản thủ công",
    paymentSubhead:
      "Chuyển số tiền và ghi mã tham chiếu — booth sẽ kiểm tra thủ công.",
    paymentStep1: "Mở app ngân hàng của bạn",
    paymentStep2: "Quét QR hoặc nhập thông tin tài khoản bên dưới",
    paymentStep3: "Ghi mã tham chiếu để booth đối chiếu được chuyển khoản",
    qrAlt: (accountName) => `Mã QR cho ${accountName}`,
    qrUnavailableHeading: "Chưa có mã QR",
    qrUnavailableHint:
      "Dùng thông tin tài khoản bên dưới để chuyển khoản thủ công.",
    bankLabel: "Ngân hàng nhận",
    accountNameLabel: "Tên tài khoản",
    accountNumberLabel: "Số tài khoản",
    reservationTotalLabel: "Tổng đơn đặt trước",
    transferReferenceLabel: "Mã tham chiếu chuyển khoản",
    boothInstructionsHeading: "Hướng dẫn từ booth",
    referenceFormHeading: "Đã chuyển khoản rồi?",
    referenceFormBody:
      "Ghi lại nội dung bạn đã nhập khi chuyển khoản để booth đối chiếu.",
    referenceFieldLabel: "Mã tham chiếu / nội dung chuyển khoản",
    referenceSubmit: "Gửi mã tham chiếu",
    referenceSubmitting: "Đang gửi…",
    referenceInvalid: "Nhập mã tham chiếu hiển thị trên biên nhận ngân hàng.",
    referenceSaveFailed: "Chưa lưu được mã tham chiếu. Vui lòng thử lại.",
    referenceClosed:
      "Đơn đặt trước này không còn nhận thêm thông tin chuyển khoản.",
    referenceSaved: "Đã gửi mã tham chiếu. Chủ booth sẽ đối chiếu thủ công.",
    paymentUnavailableHeading: "Thanh toán chưa sẵn sàng",
    paymentUnavailableBody:
      "Booth đang cấu hình hướng dẫn thanh toán. Quay lại sau nhé.",
    noTransferHeading: "Không cần thanh toán",
    summaryEyebrow: "Tóm tắt đặt trước",
    summaryHeading: "Chi tiết đặt trước",
    summaryAmountDue: "Số tiền cần chuyển",
    summaryReservationTotal: "Tổng đơn đặt trước",
    summarySubtotal: "Tạm tính trước ưu đãi",
    summaryPromotionSavings: "Tiết kiệm từ ưu đãi",
    summaryStatusLabel: "Trạng thái",
    itemsAriaLabel: "Danh sách món đã đặt",
    promotionRewardLabel: (name) => `Quà tặng ưu đãi · ${name}`,
    promotionOriginalPriceLabel: (price) => `Giá thường ${price}`,
    summaryFooter: "Không có xác minh tự động — booth sẽ xác nhận thủ công.",
  },
  publicLanding: {
    skipLink: "Bỏ qua đến nội dung",
    wordmarkAria: "Trang chủ Cyfurden",
    navAria: "Điều hướng chính",
    languageToggleLabel: "Ngôn ngữ",
    topbarSignIn: "Đăng nhập",
    heroEyebrow: "Cyfurden",
    heroTitle: "Booth độc lập cho những ngày hội chợ",
    heroBody:
      "Một studio bỏ túi cho đồ handmade số lượng nhỏ, đặt trước ở hội chợ và nhận hàng không cần giấy tờ.",
    heroNote:
      "Không có Stripe · không trung gian · bạn giữ quan hệ trực tiếp với khách",
    heroActionPrimary: "Tạo booth",
    heroActionSecondary: "Đăng nhập",
    mockPreviewHeading: "Xem trước booth",
    mockPreviewStatus: "Đang mở · booth số 07",
    mockPreviewTagline: "Zine & đồ lạ ánh trăng",
    mockPreviewItems: [
      { name: "Zine Bramble Coil A6", tag: "Giới hạn" },
      { name: "Pin enamel Mossfolk", tag: "Đặt trước" },
      { name: "Tranh in Lantern A5", tag: "Mới" },
    ],
    mockPreviewQueueLabel: "Hàng đợi đặt trước",
    mockPreviewQueueTitle: "Lịch nhận hôm nay",
    mockPreviewQueueItems: [
      { dt: "10:12", dd: "Lyra · 1 × Bramble Coil" },
      { dt: "11:35", dd: "Kai · 2 × pin Mossfolk" },
      { dt: "13:02", dd: "Mira · 1 × tranh Lantern" },
    ],
    mockPreviewCaption: "Đây là phần khách thấy khi vào booth của bạn.",
    audienceHeading: "Dành cho studio nhỏ",
    audienceItems: [
      {
        title: "Họa sĩ độc lập",
        subtitle: "Bán zine, tranh in, pin và đồ lạ mà không qua marketplace.",
      },
      {
        title: "Cuối tuần hội chợ",
        subtitle: "Nhận đặt trước trước hội chợ và giao tận booth.",
      },
      {
        title: "Người làm thủ công số lượng nhỏ",
        subtitle:
          "Vận hành một catalogue gọn và checkout chuyển khoản thủ công.",
      },
      {
        title: "Người dựng pop-up",
        subtitle: "Mở booth riêng cho một dịp và lưu trữ lại sau đó.",
      },
    ],
    workflowHeading: "Từ lần quét đầu đến trao tay cuối",
    workflowIntro:
      "Bốn bước. Mỗi bước đều thủ công, minh bạch và trong tay bạn.",
    workflowSteps: [
      {
        title: "Dựng booth",
        description:
          "Thêm sản phẩm, giá và thông tin thanh toán từ workspace booth.",
        note: "Catalogue, nhãn thanh toán và thông tin ngân hàng ở cùng một nơi.",
      },
      {
        title: "Chia sẻ link storefront",
        description: "Khách duyệt bộ sưu tập gọn gàng trên điện thoại.",
        note: "Không cần tải app, người mua không cần tài khoản.",
      },
      {
        title: "Nhận đơn đặt trước",
        description: "Khách đặt trước và nhận mã tham chiếu thanh toán.",
        note: "Mỗi đơn có mã riêng để booth đối chiếu chuyển khoản.",
      },
      {
        title: "Xác nhận và giao",
        description:
          "Booth duyệt chuyển khoản thủ công và đánh dấu đơn đã giao.",
        note: "Bạn quyết khi nào xác nhận — Cyfurden không tự xác minh.",
      },
    ],
    functionHeading: "Bên trong Cyfurden có gì",
    functionIntro:
      "Các tính năng dưới đây là toàn bộ bề mặt — gọn theo chủ đích.",
    functionItems: [
      {
        title: "Workspace booth",
        description:
          "Cập nhật catalogue, đổi nhãn thanh toán và duyệt đơn từ một trang.",
        scope: "Quản trị",
      },
      {
        title: "Storefront công khai",
        description:
          "Khách duyệt sản phẩm, đặt trước và thanh toán bằng chuyển khoản thủ công.",
        scope: "Công khai",
      },
      {
        title: "Hàng đợi đặt trước",
        description:
          "Xem đơn chờ, đã xác nhận, đã giao và đã huỷ theo từng booth.",
        scope: "Quản trị",
      },
      {
        title: "Thanh toán chuyển khoản",
        description:
          "Mỗi đơn có QR và thông tin tài khoản. Không Stripe, không trung gian.",
        scope: "Công khai + Quản trị",
      },
      {
        title: "Mạng xã hội của booth",
        description:
          "Ghim Instagram, Twitter và trang cá nhân để khách theo dõi.",
        scope: "Công khai + Quản trị",
      },
    ],
    manualHeading: "Thanh toán vẫn thủ công — và thấy rõ là thủ công",
    manualBody:
      "Cyfurden không kết nối cổng thanh toán. Khách đặt trước, rồi chuyển vào tài khoản ngân hàng của bạn và ghi mã đơn vào nội dung chuyển khoản. Booth đối chiếu thủ công.",
    manualBoundary:
      "Không Stripe. Không checkout bên thứ ba. Quan hệ nằm giữa bạn và người mua.",
    finalHeading: "Sẵn sàng đăng booth?",
    finalBody: "Tạo tài khoản, dựng booth và chia sẻ đường link.",
    finalPrimary: "Tạo tài khoản",
    finalSecondary: "Tôi đã có tài khoản",
    footerWordmark: "Cyfurden",
    footerTagline: "Studio booth cho nghệ sĩ độc lập",
    footerNavAria: "Điều hướng chân trang",
    footerSignIn: "Đăng nhập",
    footerCreateBooth: "Tạo tài khoản",
    feature1Title: "Quản lý booth tại một nơi",
    feature1Body:
      "Cập nhật danh mục, chỉnh thông tin thanh toán và duyệt đơn ngay trong cùng một workspace.",
    feature2Title: "Chia sẻ một storefront gọn gàng",
    feature2Body:
      "Khách duyệt bộ sưu tập, đặt trước sản phẩm và thanh toán bằng chuyển khoản thủ công.",
    feature3Title: "Giữ quyền kiểm soát",
    feature3Body:
      "Tự xác nhận chuyển khoản và quản lý giao hàng theo cách của bạn. Không có xác minh tự động.",
    closingTitle: "Sẵn sàng đăng booth?",
    closingBody: "Tạo tài khoản, dựng booth và chia sẻ đường link.",
    closingAction: "Tạo tài khoản",
    footerLegal: "Cyfurden · Studio booth cho nghệ sĩ độc lập",
  },
  publicAuth: {
    languageToggleLabel: "Ngôn ngữ",
    signInTitle: "Chào mừng bạn quay lại",
    signInBody: "Đăng nhập để quản lý booth và duyệt hàng đợi đặt trước.",
    signInSubmit: "Đăng nhập",
    signInSwitch: "Chưa có tài khoản? Tạo tài khoản",
    signInEmailLabel: "Email",
    signInPasswordLabel: "Mật khẩu",
    signInErrorRequired: "Cần nhập email và mật khẩu.",
    signInErrorInvalid: "Email hoặc mật khẩu chưa đúng. Thử lại nhé.",
    signInGoogleButton: "Tiếp tục với Google",
    signInGoogleUnavailable:
      "Đăng nhập Google chưa được cấu hình cho bản triển khai này.",
    signUpTitle: "Tạo tài khoản Cyfurden",
    signUpBody: "Tạo tài khoản để đăng booth và bắt đầu nhận đặt trước.",
    signUpSubmit: "Tạo tài khoản",
    signUpSwitch: "Đã có tài khoản? Đăng nhập",
    signUpNameLabel: "Tên của bạn",
    signUpEmailLabel: "Email",
    signUpPasswordLabel: "Mật khẩu",
    signUpErrorRequired: "Cần nhập tên, email và mật khẩu.",
    signUpErrorPasswordShort: "Mật khẩu cần ít nhất 8 ký tự.",
    signUpErrorPasswordWeak: "Thêm chữ hoa, chữ thường và một chữ số.",
    signUpErrorExists: "Email này đã có tài khoản. Hãy thử đăng nhập.",
    signUpErrorGeneric: "Chưa tạo được tài khoản. Thử lại nhé.",
    signUpGoogleButton: "Tiếp tục với Google",
    signUpGoogleUnavailable:
      "Đăng nhập Google chưa được cấu hình cho bản triển khai này.",
    signOutButton: "Đăng xuất",
    invitationTitle: "Tham gia booth",
    invitationBody:
      "Bạn được mời tham gia một booth Cyfurden. Chấp nhận để tiếp tục.",
    invitationAccept: "Chấp nhận lời mời",
    invitationDecline: "Từ chối",
    invitationExpired: "Đường link lời mời đã hết hạn.",
    invitationAlreadyAccepted: "Lời mời này đã được chấp nhận rồi.",
    formEyebrow: {
      signUp: "Tạo tài khoản",
      signIn: "Chào mừng bạn quay lại",
    },
    formHeading: {
      signUp: "Dựng tài khoản Cyfurden của bạn",
      signIn: "Đăng nhập Cyfurden",
    },
    formBody: {
      signUp: "Đăng booth và bắt đầu nhận đặt trước thủ công từ khách.",
      signIn: "Tiếp tục công việc — quản lý booth và duyệt đơn đặt trước.",
    },
    dividerOrEmail: "hoặc đăng nhập bằng email",
    namePlaceholder: "Tên hiển thị của bạn",
    passwordPlaceholder: {
      signUp: "Chọn mật khẩu (từ 8 ký tự)",
      signIn: "Mật khẩu của bạn",
    },
    passwordHint: "Dùng 8 ký tự trở lên, có chữ hoa, chữ thường và một chữ số.",
    confirmPasswordLabel: "Nhập lại mật khẩu",
    confirmPasswordPlaceholder: "Gõ lại mật khẩu",
    submitPending: {
      signUp: "Đang tạo tài khoản…",
      signIn: "Đang đăng nhập…",
    },
    switchPrompt: {
      signUp: "Đã có tài khoản?",
      signIn: "Mới dùng Cyfurden?",
    },
    switchLink: {
      signUp: "Đăng nhập thay thế",
      signIn: "Tạo tài khoản",
    },
    errorPasswordMismatch: "Mật khẩu chưa khớp — nhập lại nhé.",
    errorGeneric: "Có lỗi xảy ra. Vui lòng thử lại.",
    errorGoogleUnavailable:
      "Đăng nhập Google chưa được cấu hình cho bản triển khai này.",
    pageBrandAria: "Trang chủ Cyfurden",
    pageBrandSubline: "Studio booth dành cho nghệ sĩ độc lập",
    pageBackHome: "Về trang chủ",
    storyTag: "Studio nghệ sĩ độc lập",
    storyHeading: "Vận hành booth — mà vẫn giữ quyền kiểm soát",
    storyBody:
      "Cyfurden là studio bỏ túi cho nghệ sĩ làm đồ số lượng nhỏ muốn nhận đặt trước ở hội chợ mà không qua marketplace.",
    storyNote:
      "Không Stripe. Không phí marketplace. Bạn và khách giữ liên lạc trực tiếp.",
  },
};
