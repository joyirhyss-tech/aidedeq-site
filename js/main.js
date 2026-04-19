/* ============================================
   AIded EQ — Main JavaScript
   Smooth scroll, navbar, animations, mobile menu,
   bar chart, expandable cards, contact form
   ============================================ */

document.addEventListener('DOMContentLoaded', () => {

  // --- Navbar scroll effect ---
  const navbar = document.getElementById('navbar');

  function handleNavbarScroll() {
    if (window.scrollY > 50) {
      navbar.classList.add('scrolled');
    } else {
      navbar.classList.remove('scrolled');
    }
  }

  window.addEventListener('scroll', handleNavbarScroll, { passive: true });
  handleNavbarScroll();

  // --- Active nav link highlighting ---
  const sections = document.querySelectorAll('section[id], footer[id]');
  const navLinks = document.querySelectorAll('.navbar-links a:not(.btn-get-started)');

  function highlightActiveNav() {
    let current = '';
    sections.forEach(section => {
      const sectionTop = section.offsetTop - 120;
      if (window.scrollY >= sectionTop) {
        current = section.getAttribute('id');
      }
    });

    navLinks.forEach(link => {
      link.classList.remove('active');
      if (link.getAttribute('href') === '#' + current) {
        link.classList.add('active');
      }
    });
  }

  window.addEventListener('scroll', highlightActiveNav, { passive: true });
  highlightActiveNav();

  // --- Mobile hamburger menu ---
  const hamburger = document.getElementById('hamburger');
  const mobileNav = document.getElementById('mobile-nav');

  if (hamburger && mobileNav) {
    hamburger.addEventListener('click', () => {
      hamburger.classList.toggle('active');
      mobileNav.classList.toggle('open');
      document.body.style.overflow = mobileNav.classList.contains('open') ? 'hidden' : '';
    });

    // Close mobile nav when a link is clicked
    const mobileLinks = mobileNav.querySelectorAll('a');
    mobileLinks.forEach(link => {
      link.addEventListener('click', () => {
        hamburger.classList.remove('active');
        mobileNav.classList.remove('open');
        document.body.style.overflow = '';
      });
    });
  }

  // --- Intersection Observer for fade-in animations ---
  function initFadeAnimations() {
    const fadeElements = document.querySelectorAll('.fade-in');

    if ('IntersectionObserver' in window) {
      const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
          if (entry.isIntersecting) {
            entry.target.classList.add('visible');
            observer.unobserve(entry.target);
          }
        });
      }, {
        threshold: 0.01,
        rootMargin: '100px 0px 0px 0px'
      });

      fadeElements.forEach(el => {
        // Elements already in viewport on load: show immediately
        const rect = el.getBoundingClientRect();
        if (rect.top < window.innerHeight && rect.bottom > 0) {
          el.classList.add('visible');
        } else {
          observer.observe(el);
        }
      });
    } else {
      fadeElements.forEach(el => el.classList.add('visible'));
    }
  }

  // --- Bar chart animation on scroll (per-chart, so duplicate sections animate independently) ---
  function initBarChartAnimation() {
    const charts = document.querySelectorAll('.proof-chart');
    if (charts.length === 0) return;

    if ('IntersectionObserver' in window) {
      charts.forEach(chart => {
        const observer = new IntersectionObserver((entries) => {
          entries.forEach(entry => {
            if (entry.isIntersecting) {
              const localBars = entry.target.querySelectorAll('.proof-bar');
              localBars.forEach((bar, index) => {
                setTimeout(() => bar.classList.add('animated'), index * 300);
              });
              observer.unobserve(entry.target);
            }
          });
        }, { threshold: 0.3 });
        observer.observe(chart);
      });
    } else {
      document.querySelectorAll('.proof-bar').forEach(bar => bar.classList.add('animated'));
    }
  }

  // --- Expandable resource cards ---
  function initExpandableCards() {
    const toggles = document.querySelectorAll('.resource-card-toggle');

    toggles.forEach(toggle => {
      toggle.addEventListener('click', () => {
        const card = toggle.closest('.resource-card-expandable');
        if (!card) return;

        const isExpanded = card.getAttribute('data-expanded') === 'true';
        card.setAttribute('data-expanded', !isExpanded);
      });
    });
  }

  // --- Bookshelf: stack-card reveal (21st.dev pattern) ---
  function initBookshelf() {
    const books = document.querySelectorAll('.bookshelf-books > .book');
    const poDetail = document.getElementById('poDetail');
    if (books.length === 0 || !poDetail) return;

    // Inject "Talk to the Founder" link into each book-detail-inner (one-time)
    books.forEach(book => {
      const detailInner = book.querySelector('.book-detail-inner');
      const title = book.querySelector('.book-detail-header h3')?.textContent?.trim();
      if (!detailInner || !title || detailInner.querySelector('.book-detail-link--founder')) return;
      const founderLink = document.createElement('a');
      founderLink.href = `/book/?tool=${encodeURIComponent(title)}&reason=${encodeURIComponent('Specific questions after seeing the tool')}`;
      founderLink.className = 'tool-card-link book-detail-link--founder';
      founderLink.textContent = 'Talk to the Founder ↗';
      detailInner.appendChild(founderLink);
    });

    const toolIcons = {
      'anchorED': '<svg viewBox="0 0 64 64" width="28" height="28"><defs><radialGradient id="ae-orb" cx="50%" cy="50%" r="50%"><stop offset="0%" stop-color="#D86E10"/><stop offset="30%" stop-color="#EC9636"/><stop offset="60%" stop-color="#F3B55A"/><stop offset="88%" stop-color="rgba(246,200,110,0.3)"/><stop offset="100%" stop-color="transparent"/></radialGradient></defs><circle cx="32" cy="32" r="32" fill="url(#ae-orb)"/><circle cx="30" cy="29" r="7" fill="rgba(255,255,255,0.12)"/></svg>'
    };

    // Per-tool motto shown on the right page when the book opens.
    // Pulled from or written to match each tool's description.
    const toolMottos = {
      'The Good Skill': 'Start at the margins. That is where the truth already lives.',
      'Snapshots': 'Five minutes with yourself. No login, no data stored.',
      'MF Pocket Facilitator': 'Thirty years of facilitation, carried in your pocket.',
      'anchorED': 'Stay grounded for the people in the room.',
      'ROP Practice V1': 'Practice what to say before the real moment hits.',
      'Family inFluency': 'One word at a time, together.',
      'EatPlants Kitchen Coach': 'Choose differently, not better.',
      'Festival Lore': 'Every lens tells part of the story.',
      'The Good Shelf': 'Library first. Indie bookstores next. Big box last.',
      'The Law Is On Our Side': 'Know your rights before you ever sign.',
      'FieldVoices': 'From what people say to what actually happens next.',
      'TPC Board Dashboard': 'One place for everything the board needs.',
      'Not in Jeopardy!': 'Your team, your questions, your game.',
      'MyItinerary': 'Nobody carries the planning weight alone.'
    };

    const poBook = document.getElementById('poBook');

    // Per-book splash gradient pairs — all from the site theme palette
    // (navy, gold, sage, rose, plum, cream)
    const aidedeqSplashes = [
      ['#1a1a4e', '#c5a880'], // 1. The Good Skill — navy → gold
      ['#c5a880', '#1a1a4e'], // 2. Snapshots — gold → navy
      ['#7a9a7e', '#c5a880'], // 3. MF Pocket Facilitator — sage → gold
      ['#b5545b', '#e8d5b7'], // 4. anchorED — rose → cream
      ['#1a1a4e', '#7a9a7e'], // 5. ROP — navy → sage
      ['#c5a880', '#7a9a7e'], // 6. Family inFluency — gold → sage
      ['#6b4c7a', '#c5a880'], // 7. EatPlants — plum → gold
      ['#e8d5b7', '#c5a880'], // 8. Festival Lore — cream → gold
      ['#1a1a4e', '#b5545b'], // 9. The Good Shelf — navy → rose
      ['#b5545b', '#c5a880'], // 10. The Law Is On Our Side — rose → gold
      ['#7a9a7e', '#1a1a4e'], // 11. FieldVoices — sage → navy
      ['#6b4c7a', '#e8d5b7'], // 12. TPC Board Dashboard — plum → cream
      ['#c5a880', '#b5545b'], // 13. Not in Jeopardy! — gold → rose
      ['#7a9a7e', '#e8d5b7'], // 14. MyItinerary — sage → cream
    ];

    function fillBook(book) {
      const title = book.querySelector('.book-detail-header h3')?.textContent?.trim() || '';
      const desc = book.querySelector('.book-detail-inner p')?.textContent?.trim() || '';
      const spine = book.querySelector('.book-spine');
      let spineColor = '#1a1a4e';
      if (spine) {
        const cs = getComputedStyle(spine);
        spineColor = (cs.backgroundImage && cs.backgroundImage !== 'none')
          ? cs.backgroundImage
          : cs.backgroundColor;
      }
      const isLive = !!book.querySelector('.book-spine-dot--live');

      // Snap closed instantly, then re-open on next frame so the flip animation replays
      if (poBook) poBook.classList.add('po-no-transition');
      poDetail.classList.remove('open');
      if (poBook) void poBook.offsetHeight;
      if (poBook) poBook.classList.remove('po-no-transition');
      requestAnimationFrame(() => { poDetail.classList.add('open'); });

      const toolIcon = toolIcons[title] || '';
      const motto = toolMottos[title] || desc.split('.').slice(0, 1).join('.') + '.';
      const poCover = document.getElementById('poCover');
      if (poCover) poCover.style.background = spineColor;

      // Per-book themed splash gradient
      const bookIndex = Array.from(books).indexOf(book);
      const splashPair = aidedeqSplashes[bookIndex] || aidedeqSplashes[0];
      const poSplashEl = document.getElementById('poSplash');
      if (poSplashEl) {
        poSplashEl.style.background = `linear-gradient(306deg, ${splashPair[0]}, ${splashPair[1]})`;
      }
      document.getElementById('poTitle').textContent = title;
      document.getElementById('poIcon').innerHTML = toolIcon;
      const p2Title = document.getElementById('poP2Title');
      const p2Icon = document.getElementById('poP2Icon');
      if (p2Title) p2Title.textContent = title;
      if (p2Icon) p2Icon.innerHTML = toolIcon;
      document.getElementById('poPageText').textContent = '\u201C' + motto + '\u201D';
      document.getElementById('poInfoTitle').textContent = title;
      document.getElementById('poInfoDesc').textContent = desc;

      const st = document.getElementById('poStatus');
      st.textContent = isLive ? 'Live' : 'In Development';
      st.className = 'po-book-status ' + (isLive ? 'live' : 'dev');

      const lk = document.getElementById('poLinks');
      const links = book.querySelectorAll('.book-detail-inner a');
      lk.innerHTML = Array.from(links).map(a =>
        `<a href="${a.href}" target="${a.getAttribute('target') || '_self'}" rel="${a.getAttribute('rel') || ''}" class="detail-link">${a.textContent.trim()} <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 13v6a2 2 0 0 1-2 2H5 a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg></a>`
      ).join('');

      books.forEach(b => b.classList.toggle('active', b === book));
    }

    books.forEach(book => {
      const spine = book.querySelector('.book-spine');
      book.addEventListener('mouseenter', () => fillBook(book));
      if (spine) spine.addEventListener('focus', () => fillBook(book));
      if (spine) spine.addEventListener('click', (e) => { e.preventDefault(); fillBook(book); });
    });

    const toolsSection = document.getElementById('tools');
    if (toolsSection) {
      toolsSection.addEventListener('mouseleave', () => {
        poDetail.classList.remove('open');
        books.forEach(b => b.classList.remove('active'));
      });
    }
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        poDetail.classList.remove('open');
        books.forEach(b => b.classList.remove('active'));
      }
    });

  }

  // --- Return to top button ---
  const returnToTop = document.getElementById('return-to-top');
  if (returnToTop) {
    window.addEventListener('scroll', () => {
      if (window.scrollY > 600) {
        returnToTop.classList.add('visible');
      } else {
        returnToTop.classList.remove('visible');
      }
    }, { passive: true });

    returnToTop.addEventListener('click', () => {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });
  }

  // --- Contact form: pre-fill interest from session buttons ---
  function initFormPreFill() {
    const interestButtons = document.querySelectorAll('[data-interest]');
    const interestSelect = document.getElementById('interest');

    interestButtons.forEach(btn => {
      btn.addEventListener('click', (e) => {
        const interest = btn.getAttribute('data-interest');
        if (interestSelect && interest) {
          // Let the smooth scroll happen, then set the value
          setTimeout(() => {
            interestSelect.value = interest;
          }, 800);
        }
      });
    });
  }

  // --- Contact form: submission handler ---
  function initFormSubmission() {
    const form = document.getElementById('contact-form');
    const successMsg = document.getElementById('form-success');

    if (!form || !successMsg) return;

    form.addEventListener('submit', (e) => {
      e.preventDefault();

      const formData = new FormData(form);

      fetch('/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams(formData).toString()
      })
      .then(response => {
        if (response.ok) {
          form.style.display = 'none';
          successMsg.style.display = 'block';
        } else {
          alert('Something went wrong. Please try again or email us directly at info@aidedeq.org.');
        }
      })
      .catch(() => {
        alert('Something went wrong. Please try again or email us directly at info@aidedeq.org.');
      });
    });
  }

  // --- Initialize everything ---
  // Start animations immediately, don't block on fonts
  requestAnimationFrame(() => {
    initFadeAnimations();
    initBarChartAnimation();
  });

  // These don't depend on layout
  initBookshelf();
  initExpandableCards();
  initFormPreFill();
  initFormSubmission();
  initFaqToggle();

});

// --- FAQ show/hide extra questions ---
function initFaqToggle() {
  var btn = document.getElementById('faq-toggle');
  var list = document.getElementById('faq-list');
  if (!btn || !list) return;
  var extras = list.querySelectorAll('.faq-item--extra');
  if (!extras.length) {
    btn.style.display = 'none';
    return;
  }
  var shown = 'Show ' + extras.length + ' more question' + (extras.length === 1 ? '' : 's');
  var hidden = 'Show fewer questions';
  btn.textContent = shown;
  btn.addEventListener('click', function () {
    var expanded = list.classList.toggle('is-expanded');
    btn.setAttribute('aria-expanded', expanded ? 'true' : 'false');
    btn.textContent = expanded ? hidden : shown;
    if (!expanded) {
      // Close any open extras when collapsing so reopening starts clean
      extras.forEach(function (item) { item.removeAttribute('open'); });
    }
  });
}

/* ============================================
   V2 GRAFT — Firefly breathing launcher
   Binds any element with [data-breathing] to open the full-screen
   canvas overlay from breathing.js. Esc closes.
   ============================================ */
(function () {
  function launchBreathing() {
    if (!window.AidedEQBreathing) return;
    var overlay = document.createElement("div");
    overlay.className = "breathing-overlay";
    document.body.appendChild(overlay);
    var prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    function close() {
      if (overlay && overlay.parentNode) overlay.parentNode.removeChild(overlay);
      document.body.style.overflow = prevOverflow;
      document.removeEventListener("keydown", onKey);
    }
    function onKey(e) { if (e.key === "Escape") close(); }
    document.addEventListener("keydown", onKey);
    requestAnimationFrame(function () {
      window.AidedEQBreathing.mount(overlay, close);
      // Always-visible exit button (appears over the canvas during the exercise)
      var closeX = document.createElement("button");
      closeX.type = "button";
      closeX.className = "breathing-exit-x";
      closeX.setAttribute("aria-label", "Close breathing exercise");
      closeX.innerHTML = '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>';
      closeX.addEventListener("click", close);
      overlay.appendChild(closeX);
    });
  }
  document.addEventListener("click", function (e) {
    var trigger = e.target.closest("[data-breathing]");
    if (!trigger) return;
    e.preventDefault();
    launchBreathing();
  });
})();

/* ============================================
   Sticky floating CTA — shows after hero scroll
   ============================================ */
(function () {
  var cta = document.getElementById("sticky-cta");
  if (!cta) return;
  var hero = document.getElementById("hero");
  var tools = document.getElementById("tools");
  var footer = document.getElementById("contact");
  var threshold = hero ? hero.offsetHeight * 0.75 : 600;
  var ticking = false;

  function update() {
    var y = window.scrollY || window.pageYOffset;
    var endReached = false;
    // Hide as soon as the Tools section ("Every tool here can be tailored...")
    // starts entering the viewport. The CTA has done its job by then.
    if (tools) {
      var toolsTop = tools.getBoundingClientRect().top;
      if (toolsTop < window.innerHeight * 0.6) endReached = true;
    }
    // Belt-and-suspenders: also hide at the footer if tools isn't on page
    if (!endReached && footer) {
      var footerTop = footer.getBoundingClientRect().top;
      if (footerTop < window.innerHeight * 0.9) endReached = true;
    }
    if (y > threshold && !endReached) {
      cta.classList.add("is-visible");
    } else {
      cta.classList.remove("is-visible");
    }
    ticking = false;
  }

  window.addEventListener("scroll", function () {
    if (!ticking) {
      window.requestAnimationFrame(update);
      ticking = true;
    }
  }, { passive: true });
  update();
})();

/* ============================================
   Proof stats — count up on scroll into view
   ============================================ */
(function () {
  // Includes .ch-card-stat (new CodyHouse card layout) plus legacy .proof-stat.
  // animate() returns early if textContent isn't numeric, so non-number stats are safe.
  var stats = document.querySelectorAll(".proof-section .proof-stat, .proof-section .ch-card-stat");
  if (!stats.length || !("IntersectionObserver" in window)) return;

  function animate(el) {
    var raw = el.textContent.trim();
    var target = parseInt(raw, 10);
    if (isNaN(target)) return;
    var suffix = raw.replace(/[0-9]/g, "");
    var duration = 1400;
    var start = null;
    function step(ts) {
      if (!start) start = ts;
      var progress = Math.min((ts - start) / duration, 1);
      // easeOutCubic
      var eased = 1 - Math.pow(1 - progress, 3);
      var value = Math.round(target * eased);
      el.textContent = value + suffix;
      if (progress < 1) window.requestAnimationFrame(step);
    }
    el.textContent = "0" + suffix;
    window.requestAnimationFrame(step);
  }

  var io = new IntersectionObserver(function (entries) {
    entries.forEach(function (entry) {
      if (entry.isIntersecting) {
        animate(entry.target);
        io.unobserve(entry.target);
      }
    });
  }, { threshold: 0.1, rootMargin: "0px 0px -10% 0px" });

  stats.forEach(function (el) { io.observe(el); });
})();

// Image-accordion / expanding panels for #resources.
// Click any panel → it becomes active (wide), others collapse to slivers.
(function () {
  var accordion = document.querySelector('.js-resource-accordion');
  if (!accordion) return;
  var panels = accordion.querySelectorAll('.r-panel');
  panels.forEach(function (panel) {
    panel.addEventListener('click', function () {
      if (panel.classList.contains('r-panel--active')) return;
      panels.forEach(function (p) { p.classList.remove('r-panel--active'); });
      panel.classList.add('r-panel--active');
    });
  });
})();

// Legacy Resources accordion (old grid layout) — kept for any remaining .resources-grid instances
(function () {
  var grid = document.querySelector('.resources-grid[data-accordion="true"]');
  if (!grid) return;
  var cards = grid.querySelectorAll('.resource-card');

  cards.forEach(function (card) {
    var header = card.firstElementChild;
    if (!header) return;
    header.addEventListener('click', function (e) {
      // Only react if the click was on the header itself, not on a link or button inside expanded content
      if (e.target.closest('a, button')) return;
      var isOpen = card.getAttribute('data-open') === 'true';
      cards.forEach(function (c) { c.setAttribute('data-open', 'false'); });
      card.setAttribute('data-open', isOpen ? 'false' : 'true');
    });
  });
})();

// Mock port: stagger testimonials (layout + prev/next)
(function () {
  var wrap = document.getElementById('staggerWrap');
  if (!wrap) return;
  var cards = Array.prototype.slice.call(wrap.querySelectorAll('.stagger-card'));
  if (!cards.length) return;
  var prevBtn = document.getElementById('staggerPrev');
  var nextBtn = document.getElementById('staggerNext');

  function layout() {
    var cardW = window.innerWidth < 640 ? 260 : 320;
    var center = Math.floor(cards.length / 2);
    cards.forEach(function (card, i) {
      var pos = i - center;
      var isCenter = pos === 0;
      var offsetX = (cardW / 1.5) * pos;
      var offsetY = isCenter ? -50 : (pos % 2 ? 12 : -12);
      var rot = isCenter ? 0 : (pos % 2 ? 2.5 : -2.5);
      card.style.transform = 'translate(-50%, -50%) translateX(' + offsetX + 'px) translateY(' + offsetY + 'px) rotate(' + rot + 'deg)';
      card.style.zIndex = isCenter ? 10 : 5 - Math.abs(pos);
      card.style.opacity = Math.abs(pos) > 2 ? 0 : 1;
      card.classList.toggle('center', isCenter);
    });
  }

  function shift(steps) {
    if (steps > 0) {
      for (var i = 0; i < steps; i++) cards.push(cards.shift());
    } else {
      for (var j = 0; j < -steps; j++) cards.unshift(cards.pop());
    }
    layout();
  }

  cards.forEach(function (card, i) {
    card.addEventListener('click', function () {
      var center = Math.floor(cards.length / 2);
      var pos = i - center;
      if (pos !== 0) shift(pos);
    });
  });

  if (prevBtn) prevBtn.addEventListener('click', function () { shift(-1); });
  if (nextBtn) nextBtn.addEventListener('click', function () { shift(1); });
  window.addEventListener('resize', layout);
  layout();
})();

// Glass mock port: animated text cycle in hero h1
(function () {
  var container = document.getElementById('textCycle');
  if (!container) return;
  var words = ['people', 'communities', 'families', 'youth', 'teams'];
  var idx = 0;

  words.forEach(function (w, i) {
    var span = document.createElement('span');
    span.className = 'text-cycle-word' + (i === 0 ? ' active' : '');
    span.textContent = w + '.';
    container.appendChild(span);
  });

  var maxW = 0;
  Array.prototype.forEach.call(container.children, function (span) {
    span.style.position = 'relative';
    span.style.opacity = '1';
    span.style.filter = 'none';
    span.style.transform = 'none';
    var w = span.offsetWidth;
    if (w > maxW) maxW = w;
    span.style.position = '';
    span.style.opacity = '';
    span.style.filter = '';
    span.style.transform = '';
  });
  container.style.width = maxW + 'px';

  setInterval(function () {
    var current = container.querySelector('.active');
    if (!current) return;
    current.classList.remove('active');
    current.classList.add('exit');
    idx = (idx + 1) % words.length;
    var next = container.children[idx];
    setTimeout(function () {
      current.classList.remove('exit');
      next.classList.add('active');
    }, 350);
  }, 3000);
})();

// ===========================================
// CodyHouse canonical stacking cards (comparison demo).
// Ref: https://codyhouse.co/tutorials/how-stacking-cards
// Each sticky card is scaled down as the next one approaches. Bi-directional.
// ===========================================
(function () {
  var StackCards = function (element) {
    this.element = element;
    this.items = element.getElementsByClassName('js-stack-cards__item');
    this.scrolling = false;
    this.marginY = parseInt(getComputedStyle(element).getPropertyValue('--stack-cards-gap')) || 16;
    this.cardTop = this.items.length ? parseInt(getComputedStyle(this.items[0]).top) : 0;
    this.cardHeight = this.items.length ? this.items[0].offsetHeight : 0;
    this.windowHeight = window.innerHeight;
    this.init();
  };

  StackCards.prototype.init = function () {
    var self = this;
    var observer = new IntersectionObserver(function (entries) {
      if (entries[0].isIntersecting) {
        if (self.scrollListener) return;
        self.scrollListener = self.onScroll.bind(self);
        window.addEventListener('scroll', self.scrollListener);
      } else {
        if (!self.scrollListener) return;
        window.removeEventListener('scroll', self.scrollListener);
        self.scrollListener = null;
      }
    });
    observer.observe(this.element);
    window.addEventListener('resize', function () {
      self.cardHeight = self.items.length ? self.items[0].offsetHeight : 0;
      self.windowHeight = window.innerHeight;
    });
  };

  StackCards.prototype.onScroll = function () {
    if (this.scrolling) return;
    this.scrolling = true;
    window.requestAnimationFrame(this.animate.bind(this));
  };

  StackCards.prototype.animate = function () {
    var top = this.element.getBoundingClientRect().top;
    for (var i = 0; i < this.items.length; i++) {
      var scrolling = this.cardTop - top - i * (this.cardHeight + this.marginY);
      if (scrolling > 0) {
        var scale = (this.cardHeight - scrolling * 0.05) / this.cardHeight;
        this.items[i].style.transform = 'translateY(' + this.marginY * i + 'px) scale(' + scale + ')';
      } else {
        this.items[i].style.transform = '';
      }
    }
    this.scrolling = false;
  };

  var stacks = document.getElementsByClassName('js-stack-cards');
  for (var i = 0; i < stacks.length; i++) new StackCards(stacks[i]);
})();
