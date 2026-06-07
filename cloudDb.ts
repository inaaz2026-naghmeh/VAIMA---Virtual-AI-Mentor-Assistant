import fs from "fs";
import path from "path";

const STATE_KEY = "vaima_database_state";

// Setup types for Cloud Database response
export interface CloudDbSyncResult {
  provider: "VercelKV" | "SupabaseREST" | "LocalFS";
  success: boolean;
  timestamp: string;
}

/**
 * Multi-Provider Cloud State Sync Adapter
 * Automatically detects Vercel KV or Supabase credentials in the environment
 * and synchronizes the complete state JSON.
 */

// Helper logger
function logCloud(msg: string, ...args: any[]) {
  console.log(`☁️ [CloudDB] ${msg}`, ...args);
}

function logError(msg: string, ...args: any[]) {
  console.error(`❌ [CloudDB Error] ${msg}`, ...args);
}

/**
 * 1. Vercel KV Helper
 */
async function syncVercelKV_Load(): Promise<any | null> {
  const url = process.env.KV_REST_API_URL || process.env.KV_URL;
  const token = process.env.KV_REST_API_TOKEN;
  if (!url || !token) return null;

  // Normalize url
  const normalizedUrl = url.startsWith("http") ? url : `https://${url}`;

  try {
    const fetchUrl = `${normalizedUrl}/get/${STATE_KEY}`;
    const response = await fetch(fetchUrl, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    if (!response.ok) {
      logError(`Vercel KV load failure. Status: ${response.status}`);
      return null;
    }

    const data = await response.json();
    if (data && data.result) {
      try {
        // Vercel KV get might return either a serialized JSON string or a parsed object
        const parsed = typeof data.result === "string" ? JSON.parse(data.result) : data.result;
        return parsed;
      } catch (parseErr) {
        logError("Failed parsing string returned from Vercel KV:", parseErr);
        return null;
      }
    }
    return null;
  } catch (err) {
    logError("Error in syncVercelKV_Load:", err);
    return null;
  }
}

async function syncVercelKV_Save(data: any): Promise<boolean> {
  const url = process.env.KV_REST_API_URL || process.env.KV_URL;
  const token = process.env.KV_REST_API_TOKEN;
  if (!url || !token) return false;

  const normalizedUrl = url.startsWith("http") ? url : `https://${url}`;

  try {
    const fetchUrl = `${normalizedUrl}/set/${STATE_KEY}`;
    const response = await fetch(fetchUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(data),
    });

    if (!response.ok) {
      logError(`Vercel KV save failure. Status: ${response.status}`);
      return false;
    }
    return true;
  } catch (err) {
    logError("Error in syncVercelKV_Save:", err);
    return false;
  }
}

/**
 * 2. Supabase REST (PostgREST) Helper
 * Standard PostgREST uses standard web HTTP queries.
 * Users must map this table in Supabase first:
 *
 * CREATE TABLE IF NOT EXISTS state_store (
 *   id VARCHAR(255) PRIMARY KEY,
 *   state JSONB NOT NULL,
 *   updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
 * );
 */
async function syncSupabase_Load(): Promise<any | null> {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;

  try {
    const normalizedUrl = url.endsWith("/") ? url.slice(0, -1) : url;
    const fetchUrl = `${normalizedUrl}/rest/v1/state_store?id=eq.${STATE_KEY}`;

    const response = await fetch(fetchUrl, {
      method: "GET",
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
    });

    if (!response.ok) {
      // If table doesn't exist yet, we catch the error gracefully and fallback
      logError(`Supabase REST load failure. Status: ${response.status}`);
      return null;
    }

    const rows = await response.json();
    if (Array.isArray(rows) && rows.length > 0) {
      return rows[0].state;
    }
    return null;
  } catch (err) {
    logError("Error in syncSupabase_Load (Ensure state_store table is set up in your Supabase DB):", err);
    return null;
  }
}

async function syncSupabase_Save(data: any): Promise<boolean> {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return false;

  try {
    const normalizedUrl = url.endsWith("/") ? url.slice(0, -1) : url;
    const fetchUrl = `${normalizedUrl}/rest/v1/state_store`;

    const response = await fetch(fetchUrl, {
      method: "POST",
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
        Prefer: "resolution=merge-duplicates", // postgrest upsideupsert match on primary key
      },
      body: JSON.stringify({
        id: STATE_KEY,
        state: data,
        updated_at: new Date().toISOString(),
      }),
    });

    if (!response.ok) {
      logError(`Supabase REST save failure. Status: ${response.status}`);
      return false;
    }
    return true;
  } catch (err) {
    logError("Error in syncSupabase_Save:", err);
    return false;
  }
}

/**
 * Main Interface: Load state from configured Cloud Database
 */
export async function loadCloudState(): Promise<any | null> {
  // 1. Try Vercel KV
  if (process.env.KV_REST_API_URL || process.env.KV_URL) {
    logCloud("Attempting loading database from Vercel KV store...");
    const state = await syncVercelKV_Load();
    if (state) {
      logCloud("Successfully retrieved persistent state from Vercel KV!");
      return state;
    }
    logCloud("Vercel KV key empty or slow. Proceeding to fallback.");
  }

  // 2. Try Supabase REST API
  if (process.env.SUPABASE_URL) {
    logCloud("Attempting loading database from Supabase PostgreSQL via PostgREST API...");
    const state = await syncSupabase_Load();
    if (state) {
      logCloud("Successfully retrieved persistent state from Supabase SQL table!");
      return state;
    }
    logCloud("Supabase table empty, unconfigured, or timed out. Proceeding to fallback.");
  }

  logCloud("No active Cloud Database response found. Defaulting to local read pipeline.");
  return null;
}

/**
 * Main Interface: Save state to configured Cloud Database (Async Write-Behind)
 */
export async function saveCloudStateAsync(data: any): Promise<CloudDbSyncResult> {
  // 1. Try Vercel KV write
  if (process.env.KV_REST_API_URL || process.env.KV_URL) {
    const success = await syncVercelKV_Save(data);
    if (success) {
      return { provider: "VercelKV", success: true, timestamp: new Date().toISOString() };
    }
  }

  // 2. Try Supabase REST write
  if (process.env.SUPABASE_URL) {
    const success = await syncSupabase_Save(data);
    if (success) {
      return { provider: "SupabaseREST", success: true, timestamp: new Date().toISOString() };
    }
  }

  return { provider: "LocalFS", success: false, timestamp: new Date().toISOString() };
}
