const { Kafka } = require("kafkajs");
const db = require("./db");

const kafka = new Kafka({
  clientId: "config-change-detector",
  brokers: ["192.168.1.10:9092"]
});

const consumer = kafka.consumer({ groupId: "config-change-group" });
const producer = kafka.producer();

async function start() {
  await consumer.connect();
  await producer.connect();

  await consumer.subscribe({
    topic: "syslog_events",
    fromBeginning: false
  });

  console.log("Listening for syslog events from Kafka...");

  await consumer.run({
    autoCommit: false,
    eachMessage: async ({ topic, partition, message }) => {
      try {
        const event = JSON.parse(message.value.toString());

        // Only act on config change logs
        if (!event.config_change) {
          await commitOffset(topic, partition, message.offset);
          return;
        }

        console.log(`⚙️ Config change detected from ${event.device_ip}`);

        const device = await db.getDeviceDetails(event.device_ip);
        if (!device) {
          console.log("Device not found in DB:", event.device_ip);
          await commitOffset(topic, partition, message.offset);
          return;
        }

        const job = {
          ip: event.device_ip,
          username: device.username,
          password: device.password,
          command: device.backup_command,
          deviceType: device.type,
          detectedMessage: event.message,
          detectedAt: event.timestamp
        };

        await producer.send({
          topic: "config_jobs",
          messages: [{ key: event.device_ip, value: JSON.stringify(job) }]
        });

        console.log("Backup job queued for", event.device_ip);

        await commitOffset(topic, partition, message.offset);
      } catch (err) {
        console.error("Error processing syslog event:", err);
        // No commit → message will retry
      }
    }
  });
}

async function commitOffset(topic, partition, offset) {
  await consumer.commitOffsets([
    { topic, partition, offset: (Number(offset) + 1).toString() }
  ]);
}

start().catch(err => {
  console.error("Fatal startup error:", err);
  process.exit(1);
});
