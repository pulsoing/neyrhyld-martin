// =========================================================
// NEYRHYLD MARTIN - SCRIPT PRINCIPAL
// Cosmetología y Estética Integrativa
// =========================================================

document.addEventListener('DOMContentLoaded', () => {
    initMobileMenu();
    initSmoothScroll();
    initHeaderScrollEffect();
    initScrollAnimations();
    initContactFormSimulation();
});

// =========================================================
// MENÚ MOBILE
// =========================================================
function initMobileMenu() {
    const hamburger = document.querySelector('.hamburger');
    const navMenu = document.querySelector('.nav-menu');

    if (!hamburger || !navMenu) return;

    hamburger.addEventListener('click', () => {
        hamburger.classList.toggle('active');
        navMenu.classList.toggle('active');
    });

    document.querySelectorAll('.nav-menu a').forEach(link => {
        link.addEventListener('click', () => {
            hamburger.classList.remove('active');
            navMenu.classList.remove('active');
        });
    });
}

// =========================================================
// SCROLL SUAVE
// =========================================================
function initSmoothScroll() {
    document.querySelectorAll('a[href^="#"]').forEach(anchor => {
        anchor.addEventListener('click', function (e) {
            const targetId = this.getAttribute('href');

            if (!targetId || targetId === '#') return;

            const target = document.querySelector(targetId);

            if (!target) return;

            e.preventDefault();

            target.scrollIntoView({
                behavior: 'smooth',
                block: 'start'
            });
        });
    });
}

// =========================================================
// EFECTO HEADER AL HACER SCROLL
// =========================================================
function initHeaderScrollEffect() {
    const header = document.querySelector('.header');

    if (!header) return;

    const applyHeaderStyle = () => {
        if (window.scrollY > 80) {
            header.style.background = 'rgba(251, 247, 242, 0.98)';
            header.style.boxShadow = '0 8px 28px rgba(63, 53, 47, 0.12)';
        } else {
            header.style.background = 'rgba(251, 247, 242, 0.92)';
            header.style.boxShadow = '0 4px 20px rgba(63, 53, 47, 0.08)';
        }
    };

    applyHeaderStyle();
    window.addEventListener('scroll', applyHeaderStyle);
}

// =========================================================
// ANIMACIONES AL HACER SCROLL
// =========================================================
function initScrollAnimations() {
    const animatedElements = document.querySelectorAll(
        '.servicio-card, .metodo-card, .gift-card-text, .gift-card-box, .sobre-mi-image, .sobre-mi-text, .contacto-info, .contacto-form'
    );

    if (!animatedElements.length) return;

    const observerOptions = {
        threshold: 0.12,
        rootMargin: '0px 0px -50px 0px'
    };

    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (!entry.isIntersecting) return;

            entry.target.style.opacity = '1';
            entry.target.style.transform = 'translateY(0)';
            observer.unobserve(entry.target);
        });
    }, observerOptions);

    animatedElements.forEach(element => {
        element.style.opacity = '0';
        element.style.transform = 'translateY(28px)';
        element.style.transition = 'opacity 0.7s ease, transform 0.7s ease';
        observer.observe(element);
    });
}

// =========================================================
// FORMULARIO - SIMULACIÓN INICIAL
// =========================================================
function initContactFormSimulation() {
    const form = document.getElementById('contactForm');
    const submitBtn = document.getElementById('submitBtn');

    if (!form || !submitBtn) return;

    form.addEventListener('submit', (e) => {
        e.preventDefault();

        const nombre = document.getElementById('nombre')?.value.trim();
        const email = document.getElementById('email')?.value.trim();
        const telefono = document.getElementById('telefono')?.value.trim();
        const servicio = document.getElementById('servicio')?.value;
        const mensaje = document.getElementById('mensaje')?.value.trim();

        if (!nombre || !email || !servicio || !mensaje) {
            alert('Por favor completa los campos obligatorios antes de enviar.');
            return;
        }

        submitBtn.innerHTML = 'Enviando... <i class="fas fa-spinner fa-spin"></i>';
        submitBtn.disabled = true;

        const resumenConsulta = {
            nombre,
            email,
            telefono,
            servicio,
            mensaje
        };

        console.log('Consulta simulada:', resumenConsulta);

        setTimeout(() => {
            alert('✅ Consulta registrada correctamente. Pronto nos pondremos en contacto contigo.');

            form.reset();

            submitBtn.innerHTML = 'Enviar Consulta <i class="fas fa-paper-plane"></i>';
            submitBtn.disabled = false;
        }, 1200);
    });
}