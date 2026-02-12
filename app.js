const { Kafka } = require("kafkajs");
const db = require("./db");
const { spawn } = require("child_process");

const kafka = new Kafka({
  clientId: "config-change-detector",
  brokers: ["kafka:9092"]
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
        
        const trapmessage = `Config Change detected for device : ${event.device_ip} `;


        sendTrap('192.168.4.113','1164', trapmessage);

        const device = await db.getDeviceDetails(event.device_ip);
        if (!device) {
          console.log("Device not found in DB:", event.device_ip);
          await commitOffset(topic, partition, message.offset);
          return;
        }

        const job = {
          deviceIp: device.deviceIp,
          deviceId: device.deviceId,
          username: device.username,
          password: device.password,
          port:device.port,
          commandname: device.commandname,
          deviceType: device.deviceType,
          scheduleTime:device.scheduleTime,
          lastSchedule:device.lastSchedule,
          diffEmail:device.diffEmail,
          apipath:device.apipath,
          allowedattempt:3,
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


function sendTrap(targetIp, port, message) {
  const safeMessage = message.replace(/\n/g, " "); // remove line breaks
    const target = `${targetIp}:${port}`;   // 👈 include port

  const trap = spawn("snmptrap", [
    "-v", "2c",
    "-c", "public",
    target,
    "",
    "1.3.6.1.4.1.59510.1.1",
    "1.3.6.1.4.1.59510.1.5",
    "s",
    safeMessage
  ]);

  trap.on("error", err => {
    console.error("Trap send failed:", err.message);
  });

  trap.on("close", code => {
    if (code === 0) console.log("Trap sent successfully");
    else console.error("Trap exited with code", code);
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
