document.addEventListener('DOMContentLoaded', () => {
  const bookingForm = document.getElementById('booking-form');
  const bookingSuccess = document.getElementById('booking-success');
  const toolTopic = document.getElementById('tool-topic');
  const subjectLineInput = document.getElementById('subject-line');
  const selectedSlotInput = document.getElementById('selected-slot');
  const selectedSlotStartInput = document.getElementById('selected-slot-start');
  const selectedSlotEndInput = document.getElementById('selected-slot-end');
  const selectedReasonInput = document.getElementById('selected-reason');
  const selectedDurationInput = document.getElementById('selected-duration');
  const bookingStatus = document.getElementById('booking-status');
  const bookingSubmit = document.getElementById('booking-submit');
  const bookingSuccessMessage = document.getElementById('booking-success-message');
  const slotGroups = document.getElementById('slot-groups');
  const slotHelp = document.getElementById('slot-help');
  const selectedDateLabel = document.getElementById('selected-date-label');
  const calendarGrid = document.getElementById('calendar-grid');
  const calendarLabel = document.getElementById('calendar-label');
  const calendarPrev = document.getElementById('calendar-prev');
  const calendarNext = document.getElementById('calendar-next');
  const reasonChoices = Array.from(document.querySelectorAll('.booking-choice'));
  const durationChoices = Array.from(document.querySelectorAll('.duration-chip'));
  const summaryTool = document.getElementById('summary-tool');
  const summaryReason = document.getElementById('summary-reason');
  const summaryDuration = document.getElementById('summary-duration');
  const summarySlot = document.getElementById('summary-slot');
  const summarySubject = document.getElementById('summary-subject');

  if (!bookingForm || !toolTopic || !slotGroups || !calendarGrid || !calendarLabel) return;

  const chicagoOffset = '-05:00';
  const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 'July',
    'August', 'September', 'October', 'November', 'December'];
  const weekdaySlots = {
    1: ['13:00', '14:30', '16:00'],
    2: ['13:00', '14:30', '16:00'],
    3: ['13:00', '14:30', '16:00'],
    4: ['13:00', '14:30', '16:00'],
    5: ['13:00', '14:30'],
  };
  const emailDomainSuggestions = {
    'gmaul.com': 'gmail.com',
    'gmial.com': 'gmail.com',
    'gmai.com': 'gmail.com',
    'gnail.com': 'gmail.com',
    'gmail.con': 'gmail.com',
    'gmail.co': 'gmail.com',
    'yaho.com': 'yahoo.com',
    'yahoo.con': 'yahoo.com',
    'outlok.com': 'outlook.com',
    'outlook.con': 'outlook.com',
    'hotnail.com': 'hotmail.com',
    'hotmal.com': 'hotmail.com',
    'iclould.com': 'icloud.com',
  };

  const today = new Date();
  const startMonth = { year: today.getFullYear(), month: today.getMonth() + 1 };
  const maxMonthOffset = 11;

  let selectedReason = reasonChoices.find((choice) => choice.classList.contains('active'))?.dataset.reason || 'Specific questions after seeing the tool';
  let selectedDuration = durationChoices.find((choice) => choice.classList.contains('active'))?.dataset.duration || '15 minutes';
  let selectedSlot = null;
  let selectedDateKey = '';
  let liveAvailabilityMode = false;
  let currentMonth = { ...startMonth };
  let renderedGroups = [];
  let isSubmitting = false;

  function pad(value) {
    return String(value).padStart(2, '0');
  }

  function monthKeyFromParts(year, month) {
    return `${year}-${pad(month)}`;
  }

  function parseMonthKey(monthKey) {
    const [yearString, monthString] = monthKey.split('-');
    return {
      year: Number(yearString),
      month: Number(monthString),
    };
  }

  function compareMonthParts(a, b) {
    return (a.year - b.year) * 12 + (a.month - b.month);
  }

  function getMonthOffset(base, offset) {
    const baseDate = new Date(base.year, base.month - 1 + offset, 1);
    return {
      year: baseDate.getFullYear(),
      month: baseDate.getMonth() + 1,
    };
  }

  function getCurrentMonthKey() {
    return monthKeyFromParts(currentMonth.year, currentMonth.month);
  }

  function getMonthLabel(monthParts) {
    return `${monthNames[monthParts.month - 1]} ${monthParts.year}`;
  }

  function formatTimeLabel(time24) {
    const [hourString, minuteString] = time24.split(':');
    const hour = Number(hourString);
    const period = hour >= 12 ? 'PM' : 'AM';
    const displayHour = hour % 12 || 12;
    return `${displayHour}:${minuteString} ${period}`;
  }

  function addMinutes(time24, minutesToAdd) {
    const [hourString, minuteString] = time24.split(':');
    const totalMinutes = Number(hourString) * 60 + Number(minuteString) + minutesToAdd;
    const nextHour = Math.floor(totalMinutes / 60);
    const nextMinute = totalMinutes % 60;
    return `${pad(nextHour)}:${pad(nextMinute)}`;
  }

  function isPastDate(year, month, day) {
    const candidate = new Date(year, month - 1, day);
    const localToday = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    return candidate < localToday;
  }

  function buildFallbackGroups(monthKey) {
    const { year, month } = parseMonthKey(monthKey);
    const daysInMonth = new Date(year, month, 0).getDate();
    const durationMinutes = Number.parseInt(selectedDuration, 10) || 15;
    const groups = [];

    for (let day = 1; day <= daysInMonth; day += 1) {
      if (isPastDate(year, month, day)) continue;

      const date = new Date(year, month - 1, day);
      const weekday = date.getDay();
      const times = weekdaySlots[weekday];

      if (!times) continue;

      const label = `${dayNames[weekday]}, ${monthNames[month - 1]} ${day}`;
      groups.push({
        dateKey: `${year}-${pad(month)}-${pad(day)}`,
        label,
        times: times.map((time24) => ({
          display: `${label}, ${getMonthLabel({ year, month })} at ${formatTimeLabel(time24)} CT`,
          label: formatTimeLabel(time24),
          start: `${year}-${pad(month)}-${pad(day)}T${time24}:00${chicagoOffset}`,
          end: `${year}-${pad(month)}-${pad(day)}T${addMinutes(time24, durationMinutes)}:00${chicagoOffset}`,
        })),
      });
    }

    return groups;
  }

  function getSelectedDateGroup() {
    return renderedGroups.find((group) => group.dateKey === selectedDateKey) || null;
  }

  function updateSummary() {
    const tool = toolTopic.value || 'AIdedEQ general inquiry';
    const subjectLine = `${tool} | ${selectedReason}`;

    selectedReasonInput.value = selectedReason;
    selectedDurationInput.value = selectedDuration;
    subjectLineInput.value = subjectLine;
    selectedSlotInput.value = selectedSlot?.display || '';
    selectedSlotStartInput.value = selectedSlot?.start || '';
    selectedSlotEndInput.value = selectedSlot?.end || '';

    summaryTool.textContent = tool;
    summaryReason.textContent = selectedReason;
    summaryDuration.textContent = selectedDuration;
    summarySlot.textContent = selectedSlot?.display || 'Choose a date and time below';
    summarySubject.textContent = subjectLine;
  }

  function setBookingStatus(message, tone = 'info') {
    if (!bookingStatus) return;

    if (!message) {
      bookingStatus.textContent = '';
      bookingStatus.className = 'booking-status';
      return;
    }

    bookingStatus.textContent = message;
    bookingStatus.className = `booking-status is-visible ${tone === 'error' ? 'is-error' : 'is-info'}`;
  }

  function setSubmittingState(nextState) {
    isSubmitting = nextState;
    if (!bookingSubmit) return;

    bookingSubmit.disabled = nextState;
    bookingSubmit.textContent = nextState ? 'Booking your conversation...' : 'Request this conversation';
  }

  function getEmailSuggestion(email) {
    const normalized = String(email || '').trim().toLowerCase();
    const atIndex = normalized.lastIndexOf('@');

    if (atIndex === -1) return null;

    const domain = normalized.slice(atIndex + 1);
    const suggestion = emailDomainSuggestions[domain];

    if (!suggestion) return null;

    return `${normalized.slice(0, atIndex + 1)}${suggestion}`;
  }

  function renderTimeSlots() {
    const selectedGroup = getSelectedDateGroup();

    if (!selectedGroup) {
      selectedDateLabel.textContent = 'Choose a date first to open the times for that day.';
      slotGroups.innerHTML = '';
      return;
    }

    selectedDateLabel.textContent = `${selectedGroup.label} in Central Time`;
    slotGroups.innerHTML = `
      <article class="slot-day-card">
        <div class="slot-day-header">
          <strong>${selectedGroup.label}</strong>
          <span>${selectedDuration}</span>
        </div>
        <div class="slot-button-row">
          ${selectedGroup.times.map((slot) => {
            const activeClass = slot.display === selectedSlot?.display ? ' active' : '';
            return `<button type="button" class="slot-chip${activeClass}" data-slot-display="${slot.display}" data-slot-start="${slot.start}" data-slot-end="${slot.end}">${slot.label}</button>`;
          }).join('')}
        </div>
      </article>
    `;

    slotGroups.querySelectorAll('.slot-chip').forEach((button) => {
      button.addEventListener('click', () => {
        selectedSlot = {
          display: button.dataset.slotDisplay || '',
          start: button.dataset.slotStart || '',
          end: button.dataset.slotEnd || '',
        };
        slotHelp.classList.remove('error');
        renderTimeSlots();
        updateSummary();
      });
    });
  }

  function renderCalendar() {
    const monthParts = currentMonth;
    const monthKey = getCurrentMonthKey();
    const firstDay = new Date(monthParts.year, monthParts.month - 1, 1).getDay();
    const daysInMonth = new Date(monthParts.year, monthParts.month, 0).getDate();
    const availableDateKeys = new Set(renderedGroups.map((group) => group.dateKey));
    const cells = [];

    calendarLabel.textContent = getMonthLabel(monthParts);
    calendarPrev.disabled = compareMonthParts(monthParts, startMonth) <= 0;
    calendarNext.disabled = compareMonthParts(monthParts, getMonthOffset(startMonth, maxMonthOffset)) >= 0;

    for (let i = 0; i < firstDay; i += 1) {
      cells.push('<span class="calendar-day calendar-day--empty" aria-hidden="true"></span>');
    }

    for (let day = 1; day <= daysInMonth; day += 1) {
      const dateKey = `${monthKey}-${pad(day)}`;
      const isPast = isPastDate(monthParts.year, monthParts.month, day);
      const hasSlots = availableDateKeys.has(dateKey);
      const isSelected = dateKey === selectedDateKey;
      const classes = [
        'calendar-day',
        isSelected ? 'calendar-day--selected' : '',
        hasSlots ? 'calendar-day--available' : '',
        !hasSlots || isPast ? 'calendar-day--disabled' : '',
      ].filter(Boolean).join(' ');

      if (!hasSlots || isPast) {
        cells.push(`<span class="${classes}" aria-disabled="true">${day}</span>`);
      } else {
        cells.push(`<button type="button" class="${classes}" data-date-key="${dateKey}" aria-label="${monthNames[monthParts.month - 1]} ${day}, ${monthParts.year}">${day}</button>`);
      }
    }

    calendarGrid.innerHTML = cells.join('');

    calendarGrid.querySelectorAll('button.calendar-day').forEach((button) => {
      button.addEventListener('click', () => {
        selectedDateKey = button.dataset.dateKey || '';
        selectedSlot = null;
        slotHelp.classList.remove('error');
        renderCalendar();
        renderTimeSlots();
        updateSummary();
      });
    });
  }

  async function loadMonthAvailability() {
    const monthKey = getCurrentMonthKey();
    const fallbackGroups = buildFallbackGroups(monthKey);

    try {
      const response = await fetch(`/.netlify/functions/founder-availability?month=${encodeURIComponent(monthKey)}&duration=${encodeURIComponent(selectedDuration)}`);
      if (!response.ok) {
        liveAvailabilityMode = false;
        renderedGroups = fallbackGroups;
      } else {
        const data = await response.json();
        if (!Array.isArray(data.groups)) {
          liveAvailabilityMode = false;
          renderedGroups = fallbackGroups;
        } else {
          liveAvailabilityMode = true;
          renderedGroups = data.groups;
        }
      }
    } catch {
      liveAvailabilityMode = false;
      renderedGroups = fallbackGroups;
    }

    if (!renderedGroups.some((group) => group.dateKey === selectedDateKey)) {
      selectedDateKey = renderedGroups[0]?.dateKey || '';
      selectedSlot = null;
    }

    renderCalendar();
    renderTimeSlots();
    updateSummary();
  }

  function applyParams() {
    const params = new URLSearchParams(window.location.search);
    const tool = params.get('tool');
    const reason = params.get('reason');
    const duration = params.get('duration');
    const month = params.get('month');

    if (tool) {
      const matchingOption = Array.from(toolTopic.options).find((option) => option.value.toLowerCase() === tool.toLowerCase());
      if (matchingOption) {
        toolTopic.value = matchingOption.value;
      }
    }

    if (reason) {
      const matchingChoice = reasonChoices.find((choice) => (choice.dataset.reason || '').toLowerCase() === reason.toLowerCase());
      if (matchingChoice) {
        reasonChoices.forEach((choice) => choice.classList.remove('active'));
        matchingChoice.classList.add('active');
        selectedReason = matchingChoice.dataset.reason || selectedReason;
      }
    }

    if (duration) {
      const matchingDuration = durationChoices.find((choice) => (choice.dataset.duration || '').toLowerCase() === duration.toLowerCase());
      if (matchingDuration) {
        durationChoices.forEach((choice) => choice.classList.remove('active'));
        matchingDuration.classList.add('active');
        selectedDuration = matchingDuration.dataset.duration || selectedDuration;
      }
    }

    if (month) {
      const monthParts = parseMonthKey(month);
      const maxMonth = getMonthOffset(startMonth, maxMonthOffset);
      if (compareMonthParts(monthParts, startMonth) >= 0 && compareMonthParts(monthParts, maxMonth) <= 0) {
        currentMonth = monthParts;
      }
    }
  }

  toolTopic.addEventListener('change', updateSummary);

  reasonChoices.forEach((choice) => {
    choice.addEventListener('click', () => {
      reasonChoices.forEach((item) => item.classList.remove('active'));
      choice.classList.add('active');
      selectedReason = choice.dataset.reason || selectedReason;
      updateSummary();
    });
  });

  durationChoices.forEach((choice) => {
    choice.addEventListener('click', () => {
      durationChoices.forEach((item) => item.classList.remove('active'));
      choice.classList.add('active');
      selectedDuration = choice.dataset.duration || selectedDuration;
      selectedSlot = null;
      selectedDateKey = '';
      updateSummary();
      loadMonthAvailability();
    });
  });

  calendarPrev.addEventListener('click', () => {
    const previousMonth = getMonthOffset(currentMonth, -1);
    if (compareMonthParts(previousMonth, startMonth) < 0) return;
    currentMonth = previousMonth;
    selectedDateKey = '';
    selectedSlot = null;
    loadMonthAvailability();
  });

  calendarNext.addEventListener('click', () => {
    const nextMonth = getMonthOffset(currentMonth, 1);
    const maxMonth = getMonthOffset(startMonth, maxMonthOffset);
    if (compareMonthParts(nextMonth, maxMonth) > 0) return;
    currentMonth = nextMonth;
    selectedDateKey = '';
    selectedSlot = null;
    loadMonthAvailability();
  });

  bookingForm.addEventListener('submit', (event) => {
    event.preventDefault();

    if (isSubmitting) return;

    if (!selectedSlot) {
      slotHelp.textContent = 'Choose a date and time before sending the request.';
      slotHelp.classList.add('error');
      return;
    }

    const emailValue = bookingForm.querySelector('#email')?.value || '';
    const emailSuggestion = getEmailSuggestion(emailValue);

    if (emailSuggestion) {
      setBookingStatus(`That email looks mistyped. Did you mean ${emailSuggestion}?`, 'error');
      return;
    }

    setBookingStatus('');
    setSubmittingState(true);

    const formData = new FormData(bookingForm);

    if (!liveAvailabilityMode) {
      fetch('/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams(formData).toString(),
      })
        .then((response) => {
          if (response.ok) {
            bookingForm.style.display = 'none';
            bookingSuccess.style.display = 'block';
            if (bookingSuccessMessage) {
              bookingSuccessMessage.textContent = 'Your request is in. We will confirm the time manually and send the Zoom details from admin@thepracticecenter.org.';
            }
          } else {
            setBookingStatus('Something went wrong. Please try again or email us directly at admin@thepracticecenter.org.', 'error');
          }
        })
        .catch(() => {
          setBookingStatus('Something went wrong. Please try again or email us directly at admin@thepracticecenter.org.', 'error');
        })
        .finally(() => {
          setSubmittingState(false);
        });
      return;
    }

    const payload = Object.fromEntries(formData.entries());

    fetch('/.netlify/functions/book-founder-call', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
      .then(async (response) => {
        if (response.ok) {
          const result = await response.json().catch(() => ({}));
          bookingForm.style.display = 'none';
          bookingSuccess.style.display = 'block';
          if (bookingSuccessMessage) {
            bookingSuccessMessage.textContent = `Your conversation is confirmed for ${selectedSlot.display}. A calendar invite should land in the email address used for booking. The invite includes your Zoom link and a cancellation link if plans change.`;
          }
          if (result?.htmlLink) {
            setBookingStatus(`Booked successfully. You can also view the event in Google Calendar if needed.`, 'info');
          }
          return;
        }

        const error = await response.json().catch(() => null);
        const message = error?.error || 'Something went wrong. Please try again or email us directly at admin@thepracticecenter.org.';
        setBookingStatus(message, 'error');
        if (response.status === 409) {
          selectedSlot = null;
          loadMonthAvailability();
        }
      })
      .catch(() => {
        setBookingStatus('Something went wrong. Please try again or email us directly at admin@thepracticecenter.org.', 'error');
      })
      .finally(() => {
        setSubmittingState(false);
      });
  });

  applyParams();
  updateSummary();
  loadMonthAvailability();
});
