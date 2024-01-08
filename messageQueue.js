const queue = [];

// Display the next message in the queue on the sidewalk.
setInterval(
  () => {
    // Make sure queue is > 0
    if (queue.length === 0) {
      return;
    }

    // Shift
    const curString = queue.shift();

    // TODO:
    console.log(`Changing text to ${curString}`);
    fetch('http://192.168.1.51:3456/startshow', {
      headers: {
        accept: '*/*',
        'accept-language': 'en-GB,en-US;q=0.9,en;q=0.8',
        'content-type': 'application/x-www-form-urlencoded; charset=UTF-8',
        'x-requested-with': 'XMLHttpRequest',
        'Referrer-Policy': 'strict-origin-when-cross-origin',
      },
      body: `show=Banner&banner=${curString}&imgShow=orangeDot`,
      method: 'POST',
    })
      .then(() => {
        console.log('successfully changed text');
      })
      .catch(() => {
        console.log('failed to change text');
      });
  },
  1 * 60 * 1000,
);

module.exports = {
  queue,
};
