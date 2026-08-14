// Single source of truth for the platform's version indicator (Home page)
// and "What's New" content (Home page + User Guide cover). Update this
// whenever a real batch of changes ships — both the version number and the
// date are set manually here, since neither has a reliable automatic source
// (see Parked Items 11 and 12). Replace the content each release; this is
// NOT a running changelog.

export const PLATFORM_VERSION = "1.1";
export const PLATFORM_VERSION_DATE = "2026-08-14";

export const WHATS_NEW = {
  newFeatures: [
    "Star your favourite requisitions and find them all on one page",
    "Duplicate an existing requisition to start a new one faster",
    "Export any requisition as an Excel file, alongside the existing PDF option",
    "Attach a Budget Comparison document when raising a requisition",
    "Description and Remark fields now support multiple lines",
    "Emails now show the Project and Supplier, not just the PR number",
    "ALL CAPS text you type is automatically tidied up",
    "Requesters can now edit a submitted requisition directly before a PO is issued, or propose a change for Purchasing to review afterwards",
    "Status badges now show who a requisition is currently waiting on",
    "A single, consistent way to request a cancellation, for every stage of a requisition",
  ],
  bugFixes: [
    "Fixed the Item No. column truncating or wrapping awkwardly on mobile",
    "Fixed attachments on a rejected requisition being impossible to remove while editing",
    "Fixed \"Log delivery\" and \"Postpone delivery\" not being blocked while a cancellation request was pending",
  ],
};
