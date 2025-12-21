// Load footer into page
(function() {
    function loadFooter() {
        fetch('footer.html')
            .then(response => response.text())
            .then(html => {
                const footerPlaceholder = document.getElementById('footer-placeholder');
                if (footerPlaceholder) {
                    footerPlaceholder.innerHTML = html;
                }
            })
            .catch(error => {
                console.error('Error loading footer:', error);
            });
    }
    
    // Wait for DOM to be ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', loadFooter);
    } else {
        loadFooter();
    }
})();

