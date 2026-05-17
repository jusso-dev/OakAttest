const gallery = document.querySelector("[data-gallery]");

if (gallery) {
  const image = gallery.querySelector("[data-gallery-image]");
  const caption = gallery.querySelector("[data-gallery-caption]");
  const buttons = Array.from(gallery.querySelectorAll(".thumb"));

  buttons.forEach((button) => {
    button.addEventListener("click", () => {
      const src = button.getAttribute("data-src");
      const alt = button.getAttribute("data-alt");
      const label = button.getAttribute("data-caption");

      if (!src || !alt || !label || !image || !caption) {
        return;
      }

      image.setAttribute("src", src);
      image.setAttribute("alt", alt);
      caption.textContent = label;

      buttons.forEach((item) => {
        item.classList.toggle("is-active", item === button);
      });
    });
  });
}
