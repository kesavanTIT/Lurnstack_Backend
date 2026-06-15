require("dotenv").config();

console.log("=== WhatsApp Environment Configuration ===");
console.log("WHATSAPP_ENABLED             :", process.env.WHATSAPP_ENABLED);
console.log("WHATSAPP_PHONE_NUMBER_ID     :", process.env.WHATSAPP_PHONE_NUMBER_ID ? "✅ [SET]" : "❌ [NOT SET]");
console.log("WHATSAPP_ACCESS_TOKEN        :", process.env.WHATSAPP_ACCESS_TOKEN ? "✅ [SET]" : "❌ [NOT SET]");
console.log("WHATSAPP_TEMPLATE_LANGUAGE   :", process.env.WHATSAPP_TEMPLATE_LANGUAGE);
console.log("WHATSAPP_TEMPLATE_SESSION_REMINDER :", process.env.WHATSAPP_TEMPLATE_SESSION_REMINDER);
console.log("WHATSAPP_GRAPH_VERSION       :", process.env.WHATSAPP_GRAPH_VERSION);
