"use server";

export async function compileCode(code: string, language: string) {
  const JDOODLE_LANGUAGE_MAP: Record<string, string> = {
    javascript: "nodejs",
    python: "python3",
    java: "java",
    cpp: "cpp",
    csharp: "csharp",
    go: "go",
    rust: "rust",
    php: "php",
    ruby: "ruby",
    swift: "swift",
  };

  const clientId = process.env.NEXT_PUBLIC_JDOODLE_CLIENT_ID || process.env.JDOODLE_CLIENT_ID;
  const clientSecret = process.env.NEXT_PUBLIC_JDOODLE_CLIENT_SECRET || process.env.JDOODLE_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    return {
      error: "Execution Error: JDoodle API keys are missing. Please ensure your .env.local file has NEXT_PUBLIC_JDOODLE_CLIENT_ID and NEXT_PUBLIC_JDOODLE_CLIENT_SECRET defined, and you have restarted your server.",
    };
  }

  try {
    const response = await fetch("https://api.jdoodle.com/v1/execute", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      script: code,
      language: JDOODLE_LANGUAGE_MAP[language],
      versionIndex: "0",
      clientId,
      clientSecret,
    }),
  });

    const data = await response.json();
    return data;
  } catch (error: any) {
    return {
      error: "Failed to connect to JDoodle API: " + error.message,
    };
  }
}
