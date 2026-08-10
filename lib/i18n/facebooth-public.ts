import { parseLocale, type Locale } from "@/lib/i18n";

const catalogues = {
  en: {
    metadataTitle: "Facebooth showcase",
    cardEyebrow: "Published 3D booth",
    cardTitle: "Explore this booth in 3D",
    cardDescription: (count: number) =>
      count === 1
        ? "Walk around the booth plan and inspect one featured standee."
        : `Walk around the booth plan and inspect ${count} featured standees.`,
    openShowcase: "Open Facebooth",
    backToBooth: "Back to storefront",
    pageEyebrow: "Published booth plan",
    snapshotNote: (revision: number) =>
      `Public snapshot · revision ${revision}`,
    displayOnly: "Display preview only · no purchasing actions",
    dimensions: "Booth dimensions",
    millimetres: "mm",
    camera: "Camera",
    frontView: "Front",
    angleView: "Three-quarter",
    topView: "Top",
    interaction: "Drag to orbit · scroll or pinch to zoom",
    fallbackTitle: "3D preview unavailable",
    fallbackDescription:
      "This browser cannot keep the WebGL 2 preview running. The saved booth preview is shown instead.",
    merchHeading: "Featured standees",
    merchDescription:
      "These designs belong to this published snapshot and do not change with private edits.",
    merchEmpty: "This showcase does not include separate standee cards.",
    artworkFallback: "Artwork preview",
    standeeDimensions: "Standee dimensions",
  },
  vi: {
    metadataTitle: "Showcase Facebooth",
    cardEyebrow: "Booth 3D đã xuất bản",
    cardTitle: "Khám phá booth này ở chế độ 3D",
    cardDescription: (count: number) =>
      count === 1
        ? "Xem quanh bố cục booth và một standee nổi bật."
        : `Xem quanh bố cục booth và ${count} standee nổi bật.`,
    openShowcase: "Mở Facebooth",
    backToBooth: "Quay lại cửa hàng",
    pageEyebrow: "Bố cục booth đã xuất bản",
    snapshotNote: (revision: number) =>
      `Ảnh chụp công khai · phiên bản ${revision}`,
    displayOnly: "Chỉ để xem · không có thao tác mua hàng",
    dimensions: "Kích thước booth",
    millimetres: "mm",
    camera: "Góc máy",
    frontView: "Trước",
    angleView: "Ba phần tư",
    topView: "Trên",
    interaction: "Kéo để xoay · cuộn hoặc chụm để thu phóng",
    fallbackTitle: "Không thể xem bản 3D",
    fallbackDescription:
      "Trình duyệt này không thể duy trì bản xem trước WebGL 2. Ảnh booth đã lưu được hiển thị thay thế.",
    merchHeading: "Standee nổi bật",
    merchDescription:
      "Các thiết kế này thuộc ảnh chụp đã xuất bản và không thay đổi theo bản chỉnh sửa riêng tư.",
    merchEmpty: "Showcase này không có thẻ standee riêng.",
    artworkFallback: "Xem trước thiết kế",
    standeeDimensions: "Kích thước standee",
  },
} as const;

export type PublicFaceboothStrings =
  | (typeof catalogues)["en"]
  | (typeof catalogues)["vi"];

export function getPublicFaceboothStrings(
  locale: Locale | string | undefined,
): PublicFaceboothStrings {
  return catalogues[parseLocale(locale)];
}
