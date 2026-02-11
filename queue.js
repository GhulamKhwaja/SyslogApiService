const { Kafka } = require("kafkajs");

const kafka = new Kafka({
  clientId: "config-service",
  brokers: ["kafka:9092"] // Change to your Kafka broker
});

let producer;

/**
 * Connect to Kafka and create producer
 */
async function connectQueue() {
  producer = kafka.producer();
  await producer.connect();
  console.log("Kafka Producer connected");
}

/**
 * Publish job to Kafka topic
 */
async function publishJob(job) {
  if (!producer) {
    throw new Error("Kafka producer not connected. Call connectQueue() first.");
  }

  await producer.send({
    topic: "config_jobs",
    messages: [
      {
        value: JSON.stringify(job)
      }
    ]
  });
}

module.exports = { connectQueue, publishJob };
