// Load header into page
(function() {
    function loadHeader() {
        fetch('header.html')
            .then(response => response.text())
            .then(html => {
                const headerPlaceholder = document.getElementById('header-placeholder');
                if (headerPlaceholder) {
                    headerPlaceholder.innerHTML = html;
                    
                    // Initialize mobile navigation toggle after header is loaded
                    const navToggle = document.querySelector('.nav-toggle');
                    const navMenu = document.querySelector('.nav-menu');
                    
                    if (navToggle && navMenu) {
                        navToggle.addEventListener('click', () => {
                            const isActive = navMenu.classList.toggle('active');
                            navToggle.classList.toggle('active', isActive);
                            navToggle.setAttribute('aria-expanded', isActive);
                        });
                        
                        // Close menu when clicking on a link
                        navMenu.querySelectorAll('a').forEach(link => {
                            link.addEventListener('click', () => {
                                navMenu.classList.remove('active');
                                navToggle.classList.remove('active');
                                navToggle.setAttribute('aria-expanded', 'false');
                            });
                        });
                    }
                }
            })
            .catch(error => {
                console.error('Error loading header:', error);
            });
    }
    
    // Wait for DOM to be ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', loadHeader);
    } else {
        loadHeader();
    }
})();

