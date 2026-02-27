const subscribers = new Set();

function registerSubscriber(response) {
  subscribers.add(response);

  response.on("close", () => {
    subscribers.delete(response);
  });
}

function broadcast(event, payload) {
  const message = `event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`;
  for (const subscriber of subscribers) {
    try {
      subscriber.write(message);
    } catch (error) {
      subscribers.delete(subscriber);
    }
  }
}

module.exports = {
  registerSubscriber,
  broadcast
};
