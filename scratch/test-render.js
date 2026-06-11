const { renderCampaignHtml, getResolvedButtonLink } = require("../src/services/emailService");

const runTests = () => {
  console.log("--- Starting Email Template & Link Resolution Tests ---");

  // Campaign with custom link template and offer template
  const campaignOffer = {
    id: "campaign-uuid-111",
    campaignName: "Special Course Discount",
    offerTitle: "50% off React Bootcamp!",
    validTill: new Date("2026-12-31T23:59:59Z"),
    categoryIds: ["react-category"],
    courseId: "react-101",
    sessionId: null,
    audienceType: "all_students",
    subject: "Hurry up!",
    heading: "React Sale",
    body: "Get 50% discount on React Bootcamp course.",
    buttonText: "Claim Offer",
    buttonLink: "https://student-app/login?redirect=/courses/:id",
    showLogo: true,
    templateType: "offer",
    theme: "light"
  };

  const resolvedLinkOffer = getResolvedButtonLink(campaignOffer);
  console.log("Offer Template type:", campaignOffer.templateType);
  console.log("Offer Original CTA link:", campaignOffer.buttonLink);
  console.log("Offer Resolved CTA link:", resolvedLinkOffer);
  if (resolvedLinkOffer !== "https://student-app/login?redirect=/courses/react-101") {
    throw new Error("Offer link resolution failed!");
  }
  console.log("✓ Offer link resolved successfully.");

  const offerHtml = renderCampaignHtml(campaignOffer);
  if (!offerHtml.includes("react-101")) {
    throw new Error("Offer HTML does not contain resolved target link!");
  }
  if (!offerHtml.includes("React Sale") || !offerHtml.includes("50% off React Bootcamp!")) {
    throw new Error("Offer HTML does not contain campaign heading or title!");
  }
  console.log("✓ Offer HTML rendered successfully.");

  // Campaign with custom link template and session_intimation template
  const campaignSession = {
    id: "campaign-uuid-222",
    campaignName: "System Design Session Intimation",
    offerTitle: "Introduction to System Design",
    validTill: new Date("2026-12-31T23:59:59Z"),
    categoryIds: ["system-design"],
    courseId: "sys-design-course",
    sessionId: "session-uuid-12345",
    audienceType: "all_students",
    subject: "Class starting soon!",
    heading: "Join Live Class",
    body: "Please attend the live system design class using the button below.",
    buttonText: "Join Now",
    buttonLink: "https://student-app/login?redirect=/sessions/:id",
    showLogo: true,
    templateType: "session_intimation",
    theme: "light"
  };

  const resolvedLinkSession = getResolvedButtonLink(campaignSession);
  console.log("\nSession Template type:", campaignSession.templateType);
  console.log("Session Original CTA link:", campaignSession.buttonLink);
  console.log("Session Resolved CTA link:", resolvedLinkSession);
  if (resolvedLinkSession !== "https://student-app/login?redirect=/sessions/session-uuid-12345") {
    throw new Error("Session link resolution failed!");
  }
  console.log("✓ Session link resolved successfully.");

  const sessionHtml = renderCampaignHtml(campaignSession);
  if (!sessionHtml.includes("session-uuid-12345")) {
    throw new Error("Session HTML does not contain resolved target link!");
  }
  if (!sessionHtml.includes("Live Session Intimation") || !sessionHtml.includes("Introduction to System Design")) {
    throw new Error("Session HTML does not contain expected badge or title!");
  }
  console.log("✓ Session HTML rendered successfully.");

  console.log("\n--- All Tests Passed Successfully! ---");
};

try {
  runTests();
} catch (error) {
  console.error("Test execution failed:", error);
  process.exit(1);
}
