// create connection to supebase

const { createClient } = require("@supabase/supabase-js");

const supabaseUrl = process.env.SUPABASE_URL || "https://skuwxjznskoqgqratloc.supabase.co";
const serviceRoleKey = (process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim();
const anonKey = (process.env.SUPABASE_KEY || "").trim();
const usableServiceRoleKey =
    serviceRoleKey && !serviceRoleKey.startsWith("replace_with_")
        ? serviceRoleKey
        : "";

const supabaseKey =
    usableServiceRoleKey ||
    anonKey ||
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNrdXd4anpuc2tvcWdxcmF0bG9jIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU3NjQ2OTgsImV4cCI6MjA5MTM0MDY5OH0.mv9RCk95vf_hUygRcCvZBCmj-f-TIHs_MNXbYrCRrb8";

const supabase = createClient(supabaseUrl, supabaseKey);

module.exports = supabase;
