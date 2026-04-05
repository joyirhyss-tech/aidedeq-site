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

  // --- Bar chart animation on scroll ---
  function initBarChartAnimation() {
    const bars = document.querySelectorAll('.proof-bar');
    if (bars.length === 0) return;

    if ('IntersectionObserver' in window) {
      const chartObserver = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
          if (entry.isIntersecting) {
            // Animate all bars when chart becomes visible
            bars.forEach((bar, index) => {
              setTimeout(() => {
                bar.classList.add('animated');
              }, index * 300);
            });
            chartObserver.unobserve(entry.target);
          }
        });
      }, {
        threshold: 0.3
      });

      // Observe the chart container
      const chart = document.querySelector('.proof-chart');
      if (chart) {
        chartObserver.observe(chart);
      }
    } else {
      bars.forEach(bar => bar.classList.add('animated'));
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

  // --- Bookshelf tool cards interaction ---
  function initBookshelf() {
    const books = document.querySelectorAll('.book');
    if (books.length === 0) return;

    books.forEach(book => {
      const detailInner = book.querySelector('.book-detail-inner');
      const title = book.querySelector('.book-detail-header h3')?.textContent?.trim();

      if (!detailInner || !title || detailInner.querySelector('.book-detail-link--founder')) return;

      const founderLink = document.createElement('a');
      founderLink.href = `/book/?tool=${encodeURIComponent(title)}&reason=${encodeURIComponent('Specific questions after seeing the tool')}`;
      founderLink.className = 'book-detail-link book-detail-link--founder';
      founderLink.textContent = 'Talk to the Founder ↗';
      detailInner.appendChild(founderLink);
    });

    function closeBook(book) {
      book.classList.remove('active');
      const spine = book.querySelector('.book-spine');
      const detail = book.querySelector('.book-detail');
      if (spine) spine.setAttribute('aria-expanded', 'false');
      if (detail) detail.setAttribute('aria-hidden', 'true');
    }

    function openBook(book) {
      // Close all other books
      books.forEach(b => { if (b !== book) closeBook(b); });

      book.classList.add('active');
      const spine = book.querySelector('.book-spine');
      const detail = book.querySelector('.book-detail');
      if (spine) spine.setAttribute('aria-expanded', 'true');
      if (detail) {
        detail.setAttribute('aria-hidden', 'false');
        // Detect if detail would overflow viewport to the right
        positionDetail(book, detail);
      }
    }

    function positionDetail(book, detail) {
      // Reset position class
      detail.classList.remove('book-detail--left');

      // Only check on desktop (mobile uses accordion layout)
      if (window.innerWidth <= 768) return;

      // Use requestAnimationFrame to measure after DOM update
      requestAnimationFrame(() => {
        const bookRect = book.getBoundingClientRect();
        const detailWidth = 320;
        const viewportWidth = window.innerWidth;

        // If the right edge of the detail panel would exceed viewport
        if (bookRect.right + detailWidth + 20 > viewportWidth) {
          detail.classList.add('book-detail--left');
        }
      });
    }

    books.forEach(book => {
      const spine = book.querySelector('.book-spine');
      const closeBtn = book.querySelector('.book-detail-close');

      if (spine) {
        spine.addEventListener('click', (e) => {
          e.stopPropagation();
          const isActive = book.classList.contains('active');
          if (isActive) {
            closeBook(book);
          } else {
            openBook(book);
          }
        });
      }

      if (closeBtn) {
        closeBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          closeBook(book);
          // Return focus to spine
          const spine = book.querySelector('.book-spine');
          if (spine) spine.focus();
        });
      }
    });

    // Close when clicking outside any book
    document.addEventListener('click', (e) => {
      if (!e.target.closest('.book')) {
        books.forEach(book => closeBook(book));
      }
    });

    // Close on Escape key
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        books.forEach(book => closeBook(book));
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

  // FAQ toggle
  var faqToggle = document.getElementById('faq-toggle');
  var faqList = document.getElementById('faq-list');
  if (faqToggle && faqList) {
    faqToggle.addEventListener('click', function() {
      var expanded = faqList.classList.toggle('faq-list--expanded');
      faqToggle.textContent = expanded ? 'Show fewer questions' : 'Show more questions';
      faqToggle.setAttribute('aria-expanded', expanded);
    });
  }

});
