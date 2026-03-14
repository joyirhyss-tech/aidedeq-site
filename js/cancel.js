document.addEventListener('DOMContentLoaded', () => {
  const params = new URLSearchParams(window.location.search);
  const token = params.get('token');
  const cancelStatus = document.getElementById('cancel-status');
  const cancelCard = document.getElementById('cancel-card');
  const cancelButton = document.getElementById('cancel-button');
  const cancelSuccess = document.getElementById('cancel-success');
  const cancelSuccessMessage = document.getElementById('cancel-success-message');
  const rebookLink = document.getElementById('rebook-link');

  if (!cancelStatus || !cancelCard || !cancelButton || !cancelSuccess || !cancelSuccessMessage || !rebookLink) {
    return;
  }

  if (!token) {
    cancelStatus.className = 'booking-status is-visible is-error';
    cancelStatus.textContent = 'This cancellation link is missing or invalid.';
    return;
  }

  cancelStatus.className = 'booking-status is-visible is-info';
  cancelStatus.textContent = 'This cancellation link is ready. Click below if you want to cancel the meeting.';
  cancelCard.hidden = false;

  cancelButton.addEventListener('click', async () => {
    cancelButton.disabled = true;
    cancelButton.textContent = 'Canceling...';
    cancelStatus.className = 'booking-status is-visible is-info';
    cancelStatus.textContent = 'Canceling your meeting now...';

    try {
      const response = await fetch('/.netlify/functions/cancel-founder-call', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token }),
      });

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(data?.error || 'Unable to cancel the meeting.');
      }

      const toolTopic = data?.toolTopic || 'AIdedEQ general inquiry';
      cancelCard.hidden = true;
      cancelStatus.className = 'booking-status';
      cancelStatus.textContent = '';
      cancelSuccess.style.display = 'block';
      cancelSuccessMessage.textContent = data?.alreadyCanceled
        ? 'This meeting was already canceled. If you want to choose another time, head back to the booking page.'
        : 'Your meeting has been canceled. If you still want to talk, return to the booking page and choose another time.';
      rebookLink.href = `../book/?tool=${encodeURIComponent(toolTopic)}`;
    } catch (error) {
      cancelButton.disabled = false;
      cancelButton.textContent = 'Confirm cancellation';
      cancelStatus.className = 'booking-status is-visible is-error';
      cancelStatus.textContent = error instanceof Error ? error.message : 'Unable to cancel the meeting.';
    }
  });
});
