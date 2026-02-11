const { createClient } = require("redis");

const client = createClient({
  url: "redis://redis:6379"
});

client.on("error", (err) => console.error("Redis Error", err));

(async () => {
  await client.connect();
  console.log("Connected to Redis");
})();

module.exports = client;
