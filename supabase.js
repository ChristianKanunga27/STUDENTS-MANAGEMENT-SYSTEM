const { createClient } = require("@supabase/supabase-js");

const supabaseUrl = process.env.SUPABASE_URL;
const serviceRoleKey = (process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim();
const anonKey = (process.env.SUPABASE_KEY || "").trim();
const usableServiceRoleKey =
    serviceRoleKey && !serviceRoleKey.startsWith("replace_with_")
        ? serviceRoleKey
        : "";

const supabaseKey = usableServiceRoleKey || anonKey || "";

if (!supabaseUrl) {
    console.warn("WARNING: SUPABASE_URL is not set!");
}

if (!supabaseKey) {
    console.warn("WARNING: SUPABASE_SERVICE_ROLE_KEY or SUPABASE_KEY is not set!");
}

const supabase = createClient(supabaseUrl || "", supabaseKey || "anon_key_not_set");

module.exports = supabase;

