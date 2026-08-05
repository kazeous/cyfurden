const bilingual = (english: string, vietnamese: string) =>
  `[en]${english}[/en][vi]${vietnamese}[/vi]`;

export const defaultPaymentContent = {
  label: bilingual("Bank transfer", "Chuyển khoản ngân hàng"),
  instructions: bilingual(
    "Transfer the exact order total and include the order reference.",
    "Chuyển đúng tổng tiền đơn hàng và ghi kèm mã tham chiếu.",
  ),
  disclaimer: bilingual(
    "Bank transfers are reviewed manually. Cyfurden does not verify or process payment automatically.",
    "Chuyển khoản được duyệt thủ công. Cyfurden không tự động xác minh hoặc xử lý thanh toán.",
  ),
} as const;

export const defaultProductVariantLabel = bilingual("Standard", "Tiêu chuẩn");
export const defaultPromotionName = bilingual("Buy 3, get 1", "Mua 3, tặng 1");
export const defaultGachaContent = {
  title: bilingual("Wish upon the shelf", "Ước nguyện bên kệ hàng"),
  introduction: bilingual(
    "Meet a surprise from this booth.",
    "Khám phá một bất ngờ từ booth này.",
  ),
} as const;

export const defaultStorefrontContent = {
  tagline: bilingual(
    "Small wonders, gathered with care.",
    "Những điều kỳ diệu nhỏ bé, được gom góp bằng cả sự chăm chút.",
  ),
  introduction: bilingual(
    "Welcome to our pocket-sized convention booth. Browse the latest pieces and save your favourites for pickup.",
    "Chào mừng bạn đến với booth hội chợ nhỏ xinh của chúng tôi. Hãy xem các tác phẩm mới nhất và giữ lại món bạn thích để nhận sau.",
  ),
  announcement: bilingual(
    "Pre-orders are open for the next convention weekend.",
    "Đã mở đặt trước cho cuối tuần hội chợ sắp tới.",
  ),
  creatorLocation: bilingual(
    "Online and at selected conventions",
    "Trực tuyến và tại một số hội chợ",
  ),
  creatorBio: bilingual(
    "An independent artist making cheerful objects for everyday rituals.",
    "Một nghệ sĩ độc lập tạo nên những món đồ tươi vui cho nhịp sống hằng ngày.",
  ),
  eventName: bilingual("Next convention", "Hội chợ tiếp theo"),
  eventVenue: bilingual("Details coming soon", "Sắp có thông tin"),
  eventBoothLabel: bilingual("Booth TBA", "Số booth sẽ cập nhật"),
  eventHours: bilingual("Hours to be announced", "Giờ mở cửa sẽ cập nhật"),
  eventStatusLabel: bilingual("Pre-orders open", "Đang mở đặt trước"),
  eventFulfillment: bilingual(
    "Convention pickup and pre-order delivery details vary.",
    "Thông tin nhận tại hội chợ và giao đơn đặt trước có thể thay đổi.",
  ),
} as const;
