

const nodeFetch = require("node-fetch");

const BASE_URL = "https://api.teamtailor.com/v1";
const PAGE_SIZE = 30;
const MAX_RETRIES = 3;

interface CandidateAttributes {
  "first-name": string;
  "last-name": string;
  email: string;
  [key: string]: any;
}

interface JobApplicationAttributes {
  "created-at": string;
  [key: string]: any;
}

interface Relationship {
  data: Array<{ id: string; type: string }> | { id: string; type: string };
}

interface Candidate {
  id: string;
  type: string;
  attributes: CandidateAttributes;
  relationships?: {
    "job-applications"?: Relationship;
  };
}

interface JobApplication {
  id: string;
  type: string;
  attributes: JobApplicationAttributes;
}

interface ApiResponse {
  data: Candidate[];
  included?: JobApplication[];
  links?: {
    next?: string;
  };
  meta?: {
    record_count?: number;
    page_count?: number;
  };
}

interface CsvRow {
  candidate_id: string;
  first_name: string;
  last_name: string;
  email: string;
  job_application_id: string;
  job_application_created_at: string;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

// Fetch one page, retry on 429

async function fetchCandidatesPage(
  apiKey: string,
  pageNumber: number
): Promise<ApiResponse> {
  const url =
    `${BASE_URL}/candidates` +
    `?include=job-applications` +
    `&page[size]=${PAGE_SIZE}` +
    `&page[number]=${pageNumber}`;

  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    if (attempt > 0) {
      const delay = Math.pow(2, attempt - 1) * 1000;
      console.log(`  Rate limited, waiting ${delay / 1000}s...`);
      await sleep(delay);
    }

    const response = await nodeFetch(url, {
      headers: {
        Authorization: `Token token=${apiKey}`,
        "X-Api-Version": "20210218",
        "Content-Type": "application/vnd.api+json"
      }
    });

    if (response.status === 429) {
      lastError = new Error("Rate limited");
      continue;
    }

    if (!response.ok) {
      if (response.status === 401) throw new Error("Invalid API key");
      if (response.status === 403) throw new Error("Access denied");
      throw new Error(`API error: ${response.status}`);
    }

    return (await response.json()) as ApiResponse;
  }

  throw lastError || new Error("Max retries exceeded");
}


 //Fetch ALL candidates with pagination.
 // Iterates through pages until links.next is gone.
 
const fetchAllCandidates = async (apiKey: string): Promise<CsvRow[]> => {
  const allRows: CsvRow[] = [];
  let currentPage = 1;
  let totalPages: number | null = null;

  while (true) {
    const label = totalPages
      ? `${currentPage}/${totalPages}`
      : String(currentPage);
    console.log(`  Fetching page ${label}...`);

    const data = await fetchCandidatesPage(apiKey, currentPage);

    // Calculate total pages from meta info
    if (totalPages === null && data.meta) {
      if (data.meta.record_count) {
        totalPages = Math.ceil(data.meta.record_count / PAGE_SIZE);
      } else if (data.meta.page_count) {
        totalPages = data.meta.page_count;
      }
    }

    // Build lookup map for quick access by ID

    const jobAppsMap = new Map<string, JobApplication>();
    if (data.included) {
      data.included.forEach((resource) => {
        if (resource.type === "job-applications") {
          jobAppsMap.set(resource.id, resource);
        }
      });
    }

    data.data.forEach((candidate) => {
      const rows = parseCandidateToRows(candidate, jobAppsMap);
      rows.forEach((row) => {
        allRows.push(row);
      });
    });

    // Check if there is a next page
    if (data.links && data.links.next) {
      currentPage++;
    } else {
      break;
    }
  }

  return allRows;
};


 // Parse one candidate into CSV rows.
 // One candidate can have multiple job applications = multiple rows.
 
function parseCandidateToRows(
  candidate: Candidate,
  jobAppsMap: Map<string, JobApplication>
): CsvRow[] {
  const attrs = candidate.attributes;

  const candidateId = candidate.id;
  const firstName = attrs["first-name"] || "";
  const lastName = attrs["last-name"] || "";
  const email = attrs.email || "";

  const jobAppRel = candidate.relationships?.["job-applications"];
  const jobAppRefs = jobAppRel?.data;

  if (
    Array.isArray(jobAppRefs) &&
    jobAppRefs.length > 0
  ) {
    return jobAppRefs.map((ref) => {
      const jobApp = jobAppsMap.get(ref.id);
      return {
        candidate_id: candidateId,
        first_name: firstName,
        last_name: lastName,
        email: email,
        job_application_id: ref.id,
        job_application_created_at: jobApp?.attributes["created-at"] || ""
      };
    });
  }

  return [
    {
      candidate_id: candidateId,
      first_name: firstName,
      last_name: lastName,
      email: email,
      job_application_id: "",
      job_application_created_at: ""
    }
  ];
}


 //Convert rows to CSV string (RFC 4180).
 //Adds BOM for proper Excel UTF-8 handling.

const convertToCSV = (rows: CsvRow[]): string => {
  const headers = [
    "candidate_id",
    "first_name",
    "last_name",
    "email",
    "job_application_id",
    "job_application_created_at"
  ];

  const NEWLINE = String.fromCharCode(10);
  const BOM = String.fromCharCode(0xfeff);

  function escapeField(field: any): string {
    const str = String(field == null ? "" : field);
    if (
      str.indexOf(",") !== -1 ||
      str.indexOf(String.fromCharCode(34)) !== -1 ||
      str.indexOf(NEWLINE) !== -1
    ) {
      return (
        String.fromCharCode(34) +
        str.replace(/"/g, String.fromCharCode(34) + String.fromCharCode(34)) +
        String.fromCharCode(34)
      );
    }
    return str;
  }

  const csvLines = [headers.join(",")];
  rows.forEach((row) => {
    const parts = headers.map((h) => escapeField(row[h as keyof CsvRow]));
    csvLines.push(parts.join(","));
  });

  return BOM + csvLines.join(NEWLINE);
};

module.exports = { fetchAllCandidates, convertToCSV };
