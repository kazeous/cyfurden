import type { Catalogue } from "./catalogue";

const pluralItems = (count: number) => `${count} item${count === 1 ? "" : "s"}`;

export const enCatalogue: Catalogue = {
  publicBooth: {
    boothInfoEyebrow: "Booth information",
    boothInfoTitle: "About the booth",
    boothInfoOpen: "Booth info",
    boothInfoClose: "Close booth info",
    boothGuideEyebrow: "Booth guide",
    boothSideCta: "Booth highlights",
    featuredEyebrow: "Featured spotlight",
    featuredTitle: "Hand-picked pieces",
    featuredSeeAll: "View piece",
    featuredProductEyebrow: "Featured",
    featuredSeeItem: "View piece details",
    featuredCarouselA11y: {
      landmark: "Featured pieces carousel",
      slidePosition: (current, total) => `Slide ${current} of ${total}`,
      prev: "Previous featured piece",
      next: "Next featured piece",
      dots: "Featured pieces pagination",
      slide: (name) => `${name} featured slide`,
      artButton: (name) => `View details for ${name}`,
    },
    browseEyebrow: "Browse",
    browseTitle: "Find your small wonder",
    browseEmpty: "Nothing matches yet — try another search or category.",
    browseSearchPlaceholder: "Search pieces, tags, descriptions",
    browseAllLabel: "All",
    browseSortAria: "Sort pieces",
    browseSortFeatured: "Featured",
    browseSortNewest: "Newest",
    browseSortPriceAsc: "Price: low to high",
    browseSortPriceDesc: "Price: high to low",
    browseSortName: "Name",
    browseViewAria: "Change view",
    browseViewGrid: "Grid view",
    browseViewList: "List view",
    creatorProfilesAria: "Creator profiles",
    catalogueEyebrow: "Product collection",
    catalogueTitle: "Find a small wonder",
    catalogueEmpty: "No pieces to show yet.",
    catalogueEmptyHeading: "No matching merch",
    catalogueEmptyHint: "Try another category or clear your search.",
    newReleaseEyebrow: "New release",
    featuredBadge: "Featured",
    cartEyebrow: "Shopping cart",
    cartTitleEmpty: "Your bag is empty",
    cartTitleItems: (count) => pluralItems(count),
    cartReadyForReservation: (amount) =>
      `${amount} ready for manual reservation.`,
    cartEmptyHint: "Add a piece from the collection to begin.",
    cartReview: "Review bag",
    cartOpen: "Open bag",
    cartManualNote: "Manual bank transfer · no automatic verification",
    cartPausedNote:
      "Reservations are paused until payment instructions are ready",
    cartDisclaimer:
      "Payment is manual bank transfer — no automatic verification.",
    topbarBag: "Bag",
    productDetailEyebrow: "Product detail",
    productDetailChooseOption: "Choose an option",
    productDetailOptionLabel: "Option",
    productDetailUnavailable: " — unavailable",
    productDetailAvailabilitySoldOut: "Sold out",
    productDetailAvailabilityLeft: (n) => `${n} left`,
    productDetailAvailabilityPreorder: "Pre-order",
    productDetailAvailabilityAvailable: "Available",
    productDetailAddToBag: "Add to bag",
    productDetailSoldOut: "Sold out",
    productDetailReservationsPaused: "Reservations paused",
    productDetailStockLimitReached: "Stock limit reached",
    productDetailDetails: "Details",
    productDetailClose: "Close product details",
    productDetailRemoveOne: "Remove one",
    productDetailAddOne: "Add one",
    productDetailImagesAria: "Product images",
    productDetailShowImage: (n) => `Show image ${n}`,
    productDetailDisclaimer:
      "Image colours may differ slightly from the actual piece.",
    cartFooter:
      "You will receive manual bank-transfer instructions after submitting. Cyfurden does not verify payment automatically.",
    cartLineRemove: (name, variant) => `Remove ${name}, ${variant}, from bag`,
    cartLineRemoveOne: (name) => `Remove one ${name}`,
    cartLineAddOne: (name) => `Add one ${name}`,
    cartLineAvailable: (n) => `${n} available`,
    cartLineUnits: (n) => `${n} ${n === 1 ? "unit" : "units"} requested`,
    promotionProgress: (name, remaining) =>
      `${name}: add ${remaining} more qualifying ${remaining === 1 ? "item" : "items"} to unlock the reward.`,
    promotionRewardReady: (name, quantity) =>
      `${name} unlocked — add ${quantity} eligible reward ${quantity === 1 ? "item" : "items"}.`,
    promotionApplied: (name, quantity, savings) =>
      `${name}: ${quantity} ${quantity === 1 ? "reward is" : "rewards are"} free. You save ${savings}.`,
    promotionAppliedRepeatable: (name, quantity, savings, remaining) =>
      `${name}: ${quantity} ${quantity === 1 ? "reward is" : "rewards are"} free, saving ${savings}. Add ${remaining} more qualifying ${remaining === 1 ? "item" : "items"} toward the next reward.`,
    promotionFreeUnits: (quantity) =>
      `${quantity} ${quantity === 1 ? "unit" : "units"} free with offer`,
    cartSubtotalLabel: "Subtotal",
    cartPromotionSavingsLabel: "Promotion savings",
    cartTotalLabel: "Total",
    cartTotalUnits: "units requested",
    cartClear: "Clear bag",
    cartClearedAnnouncement: "Bag cleared.",
    cartLineRemovedAnnouncement: (name, variant) =>
      `${name}, ${variant}, removed from bag.`,
    cartClose: "Close bag",
    bagHeading: "Your bag",
    cartSubmit: "Reserve these pieces",
    cartSubmitPending: "Saving your reservation…",
    cartNameLabel: "Your name",
    cartEmailLabel: "Email",
    cartPhoneLabel: "Phone (optional)",
    cartNoteLabel: "Note for the booth (optional)",
    cartNamePlaceholder: "Name on the reservation",
    cartEmailPlaceholder: "name@example.com",
    cartPhonePlaceholder: "Optional contact number",
    cartNotePlaceholder: "Anything we should know?",
    cartSubmitErrorRequired: "Please share your name and email.",
    cartSubmitErrorInvalidEmail: "That email address looks off — please check.",
    cartSubmitErrorGeneric:
      "We could not save your reservation. Try again in a moment.",
    cartActionBagUnreadable:
      "The bag data could not be read. Refresh the storefront and add the items again.",
    cartActionInvalidSubmission:
      "Check your contact details and bag quantities, then send the reservation again.",
    cartActionInvalidQuantity: "The bag contains an invalid quantity.",
    cartActionStorefrontUnavailable:
      "This storefront is not accepting reservations right now.",
    cartActionPaymentUnavailable:
      "This booth has not finished its payment instructions, so reservations are temporarily unavailable.",
    cartActionItemUnavailable:
      "One of these items is no longer available. Refresh the booth and try again.",
    cartActionItemNotFound:
      "One of these items could not be found in this booth.",
    cartActionStockUnavailable: (name, quantity) =>
      `${name} no longer has ${quantity} available. Refresh the booth to see the latest stock.`,
    cartActionInvalidPrice:
      "One of these items has an invalid price and cannot be reserved.",
    cartActionSaveFailed:
      "The reservation could not be saved. Your bag is still here; wait a moment and try again.",
    cartActionStockChanged:
      "Stock changed while the reservation was being saved. Refresh the booth and try again.",
    bagFootnote: "Manual bank-transfer handoff · no automatic verification",
    publicFooterManual:
      "Manual bank-transfer handoff · no automatic verification",
    reservationPending: "Awaiting your transfer",
    reservationConfirmed: "Transfer confirmed by staff",
    reservationFulfilled: "Fulfilled",
    reservationCancelled: "Cancelled by booth",
    reservationExpired: "Reservation expired",
    reservationReferenceLabel: "Reservation reference",
    reservationItemsHeading: "Items",
    reservationItemLine: (title, qty, price) => `${title} · ${qty} × ${price}`,
    reservationItemTotal: "Line total",
    reservationAmountLabel: "Amount to transfer",
    reservationAmountLabelValue: (amount) => `${amount}`,
    reservationTransferMessageLabel: "Transfer message",
    reservationCustomerReferenceLabel: "Your bank reference",
    reservationCustomerReferenceMissing: "Not submitted yet",
    reservationBankNameLabel: "Receiving bank",
    reservationAccountNameLabel: "Account name",
    reservationAccountNumberLabel: "Account number",
    reservationPaymentLabelLabel: "Payment label",
    reservationQrCaption: "Scan to transfer",
    reservationQrCaptionGenerated: "Generated for this reservation",
    reservationQrCaptionBooth: "Booth-provided QR",
    reservationInstructionsHeading: "Transfer instructions",
    reservationDisclaimerHeading: "Manual review notice",
    reservationStorefrontLink: "Open the booth",
    reservationBackToStore: "Back to the booth",
    socialHeading: "Follow the artist",
    socialOpenProfile: "Open profile",
    socialQrAlt: (label) => `${label} profile QR code`,
    tagAriaLabel: "Tags",
    infoSocialsHeading: "Booth socials",
    gachaFreeLabel: "Free digital reveal · no purchase",
    gachaPreviewLabel: "Draft preview",
    gachaBannerTypeLabels: {
      CHARACTER: "Character",
      WEAPON: "Object",
      COLLECTION: "Collection",
    },
    gachaRarityLabels: {
      COMMON: "Common",
      RARE: "Rare",
      EPIC: "Epic",
      LEGENDARY: "Legendary",
    },
    gachaChooseBanner: "Choose a banner",
    gachaLiveNow: "Open now",
    gachaAlwaysOpen: "Always open",
    gachaOpens: (date) => `Opens ${date}`,
    gachaSchedule: (start, end) => `${start}–${end}`,
    gachaEnded: "This banner has ended",
    gachaLineupHeading: "Possible reveals",
    gachaFeaturedLabel: "Featured",
    gachaOddsHeading: "Odds and guarantee",
    gachaOddsLine: (rarity, rate) => `${rarity}: ${rate}%`,
    gachaGuaranteeRule: (draw, rarity) =>
      `${rarity} or better guaranteed by reveal ${draw}.`,
    gachaGuaranteeProgress: (remaining, rarity) =>
      `${remaining} ${remaining === 1 ? "reveal" : "reveals"} until ${rarity} or better is guaranteed.`,
    gachaRevealButton: "Make a free reveal",
    gachaRevealAgain: "Reveal again",
    gachaResultHeading: "Your reveal",
    gachaResultAnnouncement: (name, rarity) =>
      `${rarity} digital reveal: ${name}.`,
    gachaGuaranteeApplied: "Guarantee applied on this reveal.",
    gachaDigitalOnly:
      "Digital reveal only. This does not reserve or award an item, change stock, create an order, or require payment.",
    gachaNoLiveBanner:
      "No banner is open for free reveals right now. Check the schedule above.",
  },
  publicReservation: {
    pageTitle: "Reservation received",
    pageDescription:
      "Reservation reference and manual bank-transfer instructions.",
    notFoundTitle: "Reservation not found",
    notFoundBody:
      "We could not find this reservation. Double-check the link from your confirmation email.",
    notFoundAction: "Open the booth",
    backToBooth: "Back to the booth",
    receiptEyebrow: "Reservation receipt",
    referenceCaption: "Save this reference — staff will ask for it.",
    copy: "Copy",
    copied: "Copied",
    copyNumber: "Copy account number",
    copyAccount: "Copy account name",
    copyReference: "Copy reference",
    copyError: "Copy failed",
    copySuccess: (target) => `${target} copied`,
    statusBlocks: (status) => {
      const blocks: Record<
        "PENDING" | "CONFIRMED" | "FULFILLED" | "CANCELLED" | "EXPIRED",
        { heading: string; description: string; label: string }
      > = {
        PENDING: {
          heading: "Awaiting your transfer",
          description:
            "Send the amount to the account below and use the reference. Staff will confirm manually.",
          label: "Awaiting your transfer",
        },
        CONFIRMED: {
          heading: "Transfer confirmed",
          description:
            "Staff has confirmed your transfer. Hold on for fulfilment updates.",
          label: "Transfer confirmed",
        },
        FULFILLED: {
          heading: "Reservation fulfilled",
          description: "Your piece is ready. Pick it up at the booth.",
          label: "Fulfilled",
        },
        CANCELLED: {
          heading: "Reservation cancelled",
          description:
            "This reservation was cancelled by the booth. Reach out if this was unexpected.",
          label: "Cancelled by booth",
        },
        EXPIRED: {
          heading: "Reservation expired",
          description:
            "This reservation has expired. Place a new one from the booth.",
          label: "Reservation expired",
        },
      };
      return blocks[status];
    },
    paymentLabelFallback: "Untitled reservation",
    paymentHeading: "Manual bank transfer",
    paymentSubhead:
      "Send the amount and use this reference — staff will check manually.",
    paymentStep1: "Open your banking app",
    paymentStep2: "Scan the QR or enter the account details",
    paymentStep3: "Use the reference so staff can match your transfer",
    qrAlt: (accountName) => `QR code for ${accountName}`,
    qrUnavailableHeading: "QR not available",
    qrUnavailableHint: "Use the account details below to transfer manually.",
    bankLabel: "Receiving bank",
    accountNameLabel: "Account name",
    accountNumberLabel: "Account number",
    reservationTotalLabel: "Reservation total",
    transferReferenceLabel: "Transfer reference",
    boothInstructionsHeading: "Booth instructions",
    referenceFormHeading: "Already transferred?",
    referenceFormBody:
      "Share what you wrote in the transfer message so staff can match it.",
    referenceFieldLabel: "Bank reference / transfer message",
    referenceSubmit: "Submit reference",
    referenceSubmitting: "Submitting…",
    referenceInvalid:
      "Enter the transfer reference shown by your bank receipt.",
    referenceSaveFailed:
      "The transfer reference could not be saved. Try again.",
    referenceClosed:
      "This reservation is no longer accepting transfer details.",
    referenceSaved:
      "Transfer reference submitted. The booth owner will review it manually.",
    paymentUnavailableHeading: "Payment not ready yet",
    paymentUnavailableBody:
      "The booth is still setting up payment instructions. Check back soon.",
    noTransferHeading: "No payment required",
    summaryEyebrow: "Reservation summary",
    summaryHeading: "Reservation details",
    summaryAmountDue: "Amount to transfer",
    summaryReservationTotal: "Reservation total",
    summarySubtotal: "Subtotal before promotion",
    summaryPromotionSavings: "Promotion savings",
    summaryStatusLabel: "Status",
    itemsAriaLabel: "Reservation items",
    promotionRewardLabel: (name) => `Promotion reward · ${name}`,
    promotionOriginalPriceLabel: (price) => `Regular price ${price}`,
    summaryFooter: "No automatic verification — staff confirms manually.",
  },
  publicLanding: {
    skipLink: "Skip to content",
    wordmarkAria: "Cyfurden home",
    navAria: "Primary navigation",
    languageToggleLabel: "Language",
    topbarSignIn: "Sign in",
    heroEyebrow: "Cyfurden",
    heroTitle: "Independent booths for convention days",
    heroBody:
      "A pocket-sized studio for small-batch art, convention pre-orders, and pickup-without-paperwork.",
    heroNote: "No Stripe · no marketplace middleman · you own the relationship",
    heroActionPrimary: "Start a booth",
    heroActionSecondary: "Sign in",
    mockPreviewHeading: "Preview booth",
    mockPreviewStatus: "Open · booth #07",
    mockPreviewTagline: "Moonlit zines & oddities",
    mockPreviewItems: [
      { name: "Bramble Coil A6 zine", tag: "Limited" },
      { name: "Mossfolk enamel pin", tag: "Pre-order" },
      { name: "Lantern A5 print", tag: "New" },
    ],
    mockPreviewQueueLabel: "Reservation queue",
    mockPreviewQueueTitle: "Today's pickups",
    mockPreviewQueueItems: [
      { dt: "10:12", dd: "Lyra · 1 × Bramble Coil" },
      { dt: "11:35", dd: "Kai · 2 × Mossfolk pin" },
      { dt: "13:02", dd: "Mira · 1 × Lantern print" },
    ],
    mockPreviewCaption: "A preview of what your booth looks like to visitors.",
    audienceHeading: "Built for the small studio",
    audienceItems: [
      {
        title: "Solo illustrators",
        subtitle:
          "Sell zines, prints, pins, and oddities without a marketplace middleman.",
      },
      {
        title: "Convention weekends",
        subtitle:
          "Accept pre-orders before the event and hand off at the booth.",
      },
      {
        title: "Small-batch crafters",
        subtitle:
          "Run a focused catalogue and a manual bank-transfer checkout.",
      },
      {
        title: "Pop-up curators",
        subtitle: "Spin up a booth for a single weekend and archive it after.",
      },
    ],
    workflowHeading: "From first scan to final handoff",
    workflowIntro: "Four steps. Each one manual, visible, and in your hands.",
    workflowSteps: [
      {
        title: "Set up the booth",
        description:
          "Add pieces, prices, and payment details from the booth workspace.",
        note: "Catalogue, payment label, and bank details live in one place.",
      },
      {
        title: "Share the storefront link",
        description: "Visitors browse a focused collection on their phone.",
        note: "No app download, no account required for buyers.",
      },
      {
        title: "Receive reservations",
        description: "Visitors reserve pieces and get a payment reference.",
        note: "Each reservation has a unique reference so staff can match transfers.",
      },
      {
        title: "Confirm and hand off",
        description:
          "Staff reviews transfers manually and marks reservations fulfilled.",
        note: "You decide when to confirm — Cyfurden never auto-verifies.",
      },
    ],
    functionHeading: "What lives inside Cyfurden",
    functionIntro:
      "The features below are the whole surface area — small on purpose.",
    functionItems: [
      {
        title: "Booth workspace",
        description:
          "Update the catalogue, change the payment label, and review orders from one page.",
        scope: "Admin",
      },
      {
        title: "Public storefront",
        description:
          "Visitors browse pieces, reserve, and pay by manual bank transfer.",
        scope: "Public",
      },
      {
        title: "Reservation queue",
        description:
          "See pending, confirmed, fulfilled, and cancelled reservations by booth.",
        scope: "Admin",
      },
      {
        title: "Bank-transfer payment",
        description:
          "Each reservation ships with a QR and account details. No Stripe, no middleman.",
        scope: "Public + Admin",
      },
      {
        title: "Booth socials",
        description:
          "Pin Instagram, Twitter, and a personal site so visitors can follow your work.",
        scope: "Public + Admin",
      },
    ],
    manualHeading: "Payment stays manual — and visibly so",
    manualBody:
      "Cyfurden does not connect to a payment processor. Visitors reserve pieces, then transfer to your bank account and write the reservation reference in the transfer message. Staff matches transfers manually.",
    manualBoundary:
      "No Stripe. No third-party checkout. The relationship stays between you and the buyer.",
    finalHeading: "Ready to publish your booth?",
    finalBody: "Create an account, set up your booth, and share the link.",
    finalPrimary: "Create an account",
    finalSecondary: "I already have one",
    footerWordmark: "Cyfurden",
    footerTagline: "An independent-artist booth studio",
    footerNavAria: "Footer navigation",
    footerSignIn: "Sign in",
    footerCreateBooth: "Create account",
    feature1Title: "Manage the booth in one place",
    feature1Body:
      "Update the catalogue, change payment details, and review orders from a single booth workspace.",
    feature2Title: "Share a clean storefront",
    feature2Body:
      "Visitors browse a focused collection, reserve pieces, and pay by manual bank transfer.",
    feature3Title: "Stay in control",
    feature3Body:
      "Confirm transfers manually and keep fulfilment in your own hands. No automatic verification.",
    closingTitle: "Ready to publish your booth?",
    closingBody: "Create an account, set up your booth, and share the link.",
    closingAction: "Create an account",
    footerLegal: "Cyfurden · An independent-artist booth studio",
  },
  publicAuth: {
    languageToggleLabel: "Language",
    signInTitle: "Welcome back",
    signInBody:
      "Sign in to manage your booths and review the reservation queue.",
    signInSubmit: "Sign in",
    signInSwitch: "Need an account? Sign up",
    signInEmailLabel: "Email",
    signInPasswordLabel: "Password",
    signInErrorRequired: "Email and password are required.",
    signInErrorInvalid: "Email or password did not match. Try again.",
    signInGoogleButton: "Continue with Google",
    signInGoogleUnavailable:
      "Google sign-in is not configured for this deployment.",
    signUpTitle: "Create your Cyfurden account",
    signUpBody:
      "Set up your account to publish a booth and start taking reservations.",
    signUpSubmit: "Create account",
    signUpSwitch: "Already have an account? Sign in",
    signUpNameLabel: "Your name",
    signUpEmailLabel: "Email",
    signUpPasswordLabel: "Password",
    signUpErrorRequired: "Name, email, and password are required.",
    signUpErrorPasswordShort: "Use at least 8 characters in the password.",
    signUpErrorPasswordWeak:
      "Add an uppercase letter, a lowercase letter, and a number.",
    signUpErrorExists:
      "That email already has an account. Try signing in instead.",
    signUpErrorGeneric: "We could not create your account. Try again.",
    signUpGoogleButton: "Continue with Google",
    signUpGoogleUnavailable:
      "Google sign-in is not configured for this deployment.",
    signOutButton: "Sign out",
    invitationTitle: "Join the booth",
    invitationBody:
      "You have been invited to join a Cyfurden booth. Accept to continue.",
    invitationAccept: "Accept invitation",
    invitationDecline: "Decline",
    invitationExpired: "This invitation link has expired.",
    invitationAlreadyAccepted: "This invitation has already been accepted.",
    formEyebrow: {
      signUp: "Create account",
      signIn: "Welcome back",
    },
    formHeading: {
      signUp: "Set up your Cyfurden account",
      signIn: "Sign in to Cyfurden",
    },
    formBody: {
      signUp:
        "Publish a booth and start taking manual reservations from visitors.",
      signIn:
        "Pick up where you left off — manage booths and review reservations.",
    },
    dividerOrEmail: "or sign in with email",
    namePlaceholder: "Your display name",
    passwordPlaceholder: {
      signUp: "Choose a password (8+ characters)",
      signIn: "Your password",
    },
    passwordHint:
      "Use 8+ characters with an uppercase letter, a lowercase letter, and a number.",
    confirmPasswordLabel: "Confirm password",
    confirmPasswordPlaceholder: "Re-enter your password",
    submitPending: {
      signUp: "Creating your account…",
      signIn: "Signing you in…",
    },
    switchPrompt: {
      signUp: "Already have an account?",
      signIn: "New to Cyfurden?",
    },
    switchLink: {
      signUp: "Sign in instead",
      signIn: "Create an account",
    },
    errorPasswordMismatch: "Passwords do not match — please re-enter.",
    errorGeneric: "Something went wrong. Try again.",
    errorGoogleUnavailable:
      "Google sign-in is not configured for this deployment.",
    pageBrandAria: "Cyfurden home",
    pageBrandSubline: "An independent-artist booth studio",
    pageBackHome: "Back to home",
    storyTag: "Independent artist studio",
    storyHeading: "Run your booth — without giving up control",
    storyBody:
      "Cyfurden is a pocket-sized studio for small-batch artists who want to take reservations at convention weekends without a marketplace middleman.",
    storyNote:
      "No Stripe. No marketplace fees. You and the buyer stay in direct contact.",
  },
};
