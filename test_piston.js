// test_piston.js
const fetch = require('node-fetch');

async function testPiston() {
  try {
    console.log("Fetching Piston API...");
    const response = await fetch("https://emkc.org/api/v2/piston/execute", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        language: "javascript",
        version: "*",
        files: [{ content: "console.log('Hello from Piston!');" }],
      }),
    });

    const data = await response.json();
    console.log("FULL RESPONSE JSON:");
    console.log(JSON.stringify(data, null, 2));
  } catch (err) {
    console.error("Fetch failed:", err);
  }
}

testPiston();
