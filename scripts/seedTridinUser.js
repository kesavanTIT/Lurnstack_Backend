const { PrismaClient } = require("@prisma/client");
const bcrypt = require("bcryptjs");

const prisma = new PrismaClient();

async function main() {
  const email = "kesavamoorthy@tridinsoftware.com";
  const rawPassword = "buyW6ng";
  const fullName = "Kesavamoorthy (Tridin Candidate)";

  console.log("Checking for existing user:", email);

  const existing = await prisma.user.findFirst({
    where: {
      email: { equals: email, mode: "insensitive" },
    },
  });

  const hashedPassword = await bcrypt.hash(rawPassword, 12);

  if (existing) {
    console.log("User already exists. Updating password and role to TRIDIN_CANDIDATE...");
    const updated = await prisma.user.update({
      where: { id: existing.id },
      data: {
        password: hashedPassword,
        role: "TRIDIN_CANDIDATE",
        isActive: true,
      },
    });
    console.log("Successfully updated candidate user:", updated.email);
  } else {
    console.log("Creating new TRIDIN_CANDIDATE user...");
    const created = await prisma.user.create({
      data: {
        fullName,
        email,
        password: hashedPassword,
        role: "TRIDIN_CANDIDATE",
        isActive: true,
      },
    });
    console.log("Successfully created candidate user:", created.email);
  }
}

main()
  .catch((e) => {
    console.error("Error seeding Tridin candidate:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
