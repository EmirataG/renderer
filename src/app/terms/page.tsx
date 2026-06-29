import type { Metadata } from "next";
import { LegalDocument, type LegalSection } from "@/components/LegalDocument";

// ─────────────────────────────────────────────────────────────────────────
// EDIT THESE before launch (and have a lawyer review the whole document).
//   • COMPANY_NAME / COMPANY_ENTITY — your registered legal entity.
//   • GOVERNING_LAW — the state/country whose law governs + courts.
//   • CONTACT_EMAIL — general/legal contact.
//   • COPYRIGHT_AGENT_* — your DMCA Designated Agent. You MUST also register
//     the agent with the U.S. Copyright Office (DMCA Designated Agent
//     Directory, dmca.copyright.gov) for §512 safe-harbor protection; the
//     registration expires and must be renewed every three years.
// ─────────────────────────────────────────────────────────────────────────
const COMPANY_NAME = "Manuscript";
const COMPANY_ENTITY = "Manuscript"; // e.g. "Manuscript, Inc."
const CONTACT_EMAIL = "support@manuscript.app";
const COPYRIGHT_EMAIL = "copyright@manuscript.app";
const COPYRIGHT_AGENT_NAME = "Manuscript Copyright Agent";
const COPYRIGHT_AGENT_ADDRESS = "[mailing address on file with the U.S. Copyright Office]";
const GOVERNING_LAW = "[the EU member state where the company is established]";
const LAST_UPDATED = "June 29, 2026";
// ─────────────────────────────────────────────────────────────────────────

export const metadata: Metadata = {
  title: "Terms of Service — Manuscript",
  description: `Terms of Service for ${COMPANY_NAME}, a score visualization and sync tool.`,
};

const SECTIONS: LegalSection[] = [
  {
    title: "Acceptance of Terms",
    paras: [
      `These Terms of Service ("Terms") govern your access to and use of ${COMPANY_NAME} (the "Service"), a web application that turns musical scores and audio recordings into synchronized score-animation videos. By creating an account or otherwise using the Service, you agree to be bound by these Terms and by our Privacy Policy, which is incorporated by reference.`,
      `If you do not agree to these Terms, do not use the Service. If you are using the Service on behalf of an organization, you represent that you have authority to bind that organization to these Terms.`,
    ],
  },
  {
    title: "The Service",
    paras: [
      `${COMPANY_NAME} lets you upload a music score (MusicXML, MXL, or MEI), an audio recording, and an optional background image; align score events to the audio; preview the synchronized animation; and export it as a video. Video export is rendered and encoded entirely on your own device — exported videos are not uploaded to or stored on our servers. The files you upload (score, audio, image) are stored on our cloud infrastructure so that we can render and return your project to you.`,
      `The Service is under active development and may be offered on a pre-release or "beta" basis. Features may change, be added, or be removed at any time.`,
    ],
  },
  {
    title: "Accounts & Eligibility",
    paras: [
      `Some features require an account, which you create through a third-party sign-in provider (Google). You are responsible for all activity that occurs under your account and for maintaining the security of the credentials used to access it.`,
    ],
    bullets: [
      "You must be at least 13 years old, or the minimum age of digital consent in your country, to use the Service.",
      "You agree to provide accurate information and to keep it current.",
      "You are responsible for any content uploaded and any actions taken through your account.",
      "Notify us promptly of any unauthorized use of your account.",
    ],
  },
  {
    title: "Your Content & Ownership",
    paras: [
      `"Your Content" means the scores, audio, images, project settings, and other material you upload to or create within the Service. You retain all ownership rights in Your Content. We do not claim ownership of it.`,
      `To operate the Service, you grant ${COMPANY_NAME} a limited, non-exclusive, worldwide, royalty-free license to host, store, reproduce, and process Your Content solely for the purpose of providing the Service to you (for example, to render your score, store your project, and stream your files back to your browser). This license ends when Your Content is deleted, except for residual copies retained transiently or in routine backups for a limited period.`,
    ],
  },
  {
    title: "Content Rights, Copyright & Music Licensing",
    paras: [
      `Musical compositions and sound recordings are frequently protected by copyright, and they often involve multiple, separately-owned rights — including rights in the underlying composition (held by songwriters/publishers) and rights in the specific recording (held by performers/labels). Creating a video that combines a recording or score with moving visuals can additionally implicate "synchronization" and other rights. You are solely responsible for ensuring you hold every right necessary to upload Your Content and to create, reproduce, distribute, and publicly perform or display any video you export.`,
      `${COMPANY_NAME} does not grant, obtain, clear, or provide any music license of any kind. We do not hold blanket agreements with publishers, labels, performing-rights organizations, or other rightsholders, and using the Service does not give you any synchronization, mechanical, master-use, performance, or other license. Obtaining any required licenses is entirely your responsibility.`,
    ],
    bullets: [
      "You represent and warrant that you own Your Content, or have obtained all licenses, permissions, and consents required to upload it and to make and use any video you export from it.",
      "You agree not to upload content that infringes any copyright, trademark, or other right of a third party.",
      "You acknowledge that exporting a video does not clear any rights, and that distributing or publishing that video may require licenses you must obtain yourself.",
      "We respect the intellectual-property rights of others and expect you to do the same.",
    ],
  },
  {
    title: "Copyright Complaints & Notice-and-Takedown",
    paras: [
      `We operate a notice-and-takedown process and respond to copyright complaints in accordance with applicable law — including the EU Digital Services Act and e-Commerce rules governing hosting providers and, for matters arising under U.S. law, the Digital Millennium Copyright Act ("DMCA"). If you believe content stored on the Service infringes a copyright you own or control, send a written notice to our copyright contact that includes:`,
    ],
    bullets: [
      "A physical or electronic signature of the copyright owner or a person authorized to act on their behalf;",
      "Identification of the copyrighted work claimed to have been infringed;",
      "Identification of the material that is claimed to be infringing and information reasonably sufficient to let us locate it;",
      "Your contact information (name, address, telephone number, and email);",
      "A statement that you have a good-faith belief that the use is not authorized by the copyright owner, its agent, or the law;",
      "A statement, under penalty of perjury, that the information in the notice is accurate and that you are authorized to act on the copyright owner's behalf.",
    ],
    outro: [
      `Copyright contact (also our DMCA Designated Agent for U.S. notices): ${COPYRIGHT_AGENT_NAME}, ${COPYRIGHT_EMAIL}, ${COPYRIGHT_AGENT_ADDRESS}.`,
      `Counter-notification: if your material was removed and you believe it was removed in error or misidentification, you may send a counter-notification to the same agent containing the information required by the DMCA. We may restore the material if the original complainant does not seek a court order within the time period required by law.`,
      `Repeat-infringer policy: we will, in appropriate circumstances and at our discretion, disable or terminate the accounts of users who are the subject of repeated valid infringement notices or who we otherwise determine to be repeat infringers. Knowingly making a material misrepresentation in a notice or counter-notification may expose you to liability for damages under the DMCA.`,
    ],
  },
  {
    title: "Acceptable Use",
    paras: ["You agree not to:"],
    bullets: [
      "Upload, store, or share unlawful, infringing, harmful, or deceptive content.",
      "Upload personal data about others without the rights or consent to do so.",
      "Attempt to disrupt, overload, probe, or gain unauthorized access to the Service or its infrastructure.",
      "Reverse engineer, decompile, or attempt to extract source code, except where such restriction is prohibited by law.",
      "Use automated means to access the Service in a way that imposes an unreasonable load, or to scrape or bulk-download content you do not own.",
      "Use the Service to build a competing product, or resell access without our written permission.",
    ],
  },
  {
    title: "Service Availability & Data",
    paras: [
      `We strive to keep the Service available and reliable, but we do not guarantee uninterrupted or error-free operation. We may modify, suspend, or discontinue any part of the Service at any time, with or without notice.`,
      `We do not guarantee that Your Content will be retained indefinitely or that it cannot be lost. You are responsible for keeping your own copies of any content and exported videos that matter to you.`,
    ],
  },
  {
    title: "Fees",
    paras: [
      `The Service is currently provided free of charge. We may introduce paid features, plans, or usage limits in the future. If we do, we will make the applicable pricing and terms available before you incur any charge, and your continued use of paid features after that point constitutes acceptance of those terms.`,
    ],
  },
  {
    title: "Intellectual Property",
    paras: [
      `The Service, including its software, design, text, graphics, logos, and the "${COMPANY_NAME}" name and branding, is owned by ${COMPANY_NAME} or its licensors and is protected by intellectual-property laws. Subject to these Terms, you are granted a limited, revocable, non-transferable license to use the Service for its intended purpose. No rights are granted to you in our intellectual property except as expressly stated here.`,
      `The Service is built with third-party and open-source software (including the Verovio music-engraving library and SMuFL-compliant music fonts), which remains the property of its respective owners and is used under its own license terms.`,
    ],
  },
  {
    title: "Third-Party Services",
    paras: [
      `The Service relies on third-party providers — including Google and Firebase for authentication, database, and file storage, and embedded YouTube players for demonstration content. Your use of those features may be subject to the third parties' own terms and privacy policies. We are not responsible for third-party services and do not control them.`,
    ],
  },
  {
    title: "Disclaimer of Warranties",
    paras: [
      `THE SERVICE IS PROVIDED "AS IS" AND "AS AVAILABLE," WITHOUT WARRANTIES OF ANY KIND, WHETHER EXPRESS, IMPLIED, OR STATUTORY, INCLUDING WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, TITLE, AND NON-INFRINGEMENT. WE DO NOT WARRANT THAT SCORE RENDERING, TIMING, OR VIDEO EXPORT WILL BE ACCURATE, UNINTERRUPTED, OR ERROR-FREE, OR THAT THE SERVICE WILL WORK ON ANY PARTICULAR DEVICE OR BROWSER.`,
    ],
  },
  {
    title: "Limitation of Liability",
    paras: [
      `TO THE MAXIMUM EXTENT PERMITTED BY LAW, ${COMPANY_NAME.toUpperCase()} AND ITS OPERATORS WILL NOT BE LIABLE FOR ANY INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, OR PUNITIVE DAMAGES, OR FOR ANY LOSS OF DATA, PROFITS, OR GOODWILL, ARISING OUT OF OR RELATING TO YOUR USE OF THE SERVICE. OUR TOTAL LIABILITY FOR ANY CLAIM RELATING TO THE SERVICE WILL NOT EXCEED THE GREATER OF THE AMOUNT YOU PAID US IN THE TWELVE MONTHS BEFORE THE CLAIM OR ONE HUNDRED (100) EUROS.`,
    ],
    outro: [
      `Nothing in these Terms excludes or limits our liability where it would be unlawful to do so. In particular, if you are a consumer, these Terms do not affect any mandatory rights you have under the law of your country of residence, and we do not exclude or limit liability that cannot be excluded or limited under that law (such as liability for death or personal injury caused by negligence, fraud, or gross negligence).`,
    ],
  },
  {
    title: "Indemnification",
    paras: [
      `You agree to indemnify and hold harmless ${COMPANY_NAME} and its operators from any claims, damages, liabilities, and expenses (including reasonable legal fees) arising out of Your Content, your use of the Service, any video you create or distribute using the Service, or your violation of these Terms or of any law or third-party right.`,
    ],
  },
  {
    title: "Termination",
    paras: [
      `You may stop using the Service at any time and may delete your projects or account. We may suspend or terminate your access to the Service, with or without notice, if you violate these Terms or if we reasonably believe your use poses a risk to the Service or others.`,
      `Upon termination, your right to use the Service ends, and we may delete Your Content. Provisions that by their nature should survive termination — including ownership, disclaimers, limitation of liability, and indemnification — will survive.`,
    ],
  },
  {
    title: "Changes to These Terms",
    paras: [
      `We may update these Terms from time to time. When we do, we will revise the "Last updated" date above and, for material changes, take reasonable steps to notify you. Your continued use of the Service after the changes take effect constitutes acceptance of the revised Terms.`,
    ],
  },
  {
    title: "Governing Law",
    paras: [
      `These Terms are governed by the laws of ${GOVERNING_LAW}, without regard to its conflict-of-laws rules. You agree to the exclusive jurisdiction of the courts located there for any dispute arising out of or relating to these Terms or the Service, except where prohibited by applicable law.`,
    ],
  },
  {
    title: "Contact",
    paras: [
      `General questions about these Terms can be sent to ${CONTACT_EMAIL}. Copyright notices must be sent to our Designated Copyright Agent at ${COPYRIGHT_EMAIL}. ${COMPANY_ENTITY} operates the Service.`,
    ],
  },
];

export default function TermsPage() {
  return (
    <LegalDocument
      companyName={COMPANY_NAME}
      docTitle="Terms of Service"
      lastUpdated={LAST_UPDATED}
      contactEmail={CONTACT_EMAIL}
      intro={`Please read these Terms carefully before using ${COMPANY_NAME}. They set out the rules for using the Service and the rights and responsibilities of both you and us.`}
      sections={SECTIONS}
      footerNote={`By continuing to use ${COMPANY_NAME}, you acknowledge that you have read and agree to these Terms of Service.`}
      crossLinks={[{ href: "/privacy", label: "Privacy" }]}
    />
  );
}
