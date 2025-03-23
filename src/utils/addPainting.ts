// async function addPainting(title, imageFile, alt, price, description, token) {
//   const fileName = title.toLowerCase().replace(/\s/g, "-");
//   const mdContent = `---
// title: "${title}"
// image: "./${fileName}.jpg"
// alt: "${alt}"
// price: ${price}
// sold: false
// ---
// ${description}`;

//   const headers = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
//   const repo = "your-username/your-repo";

//   // Commit Markdown
//   await fetch(`https://api.github.com/repos/${repo}/contents/src/content/paintings/${fileName}.md`, {
//     method: "PUT",
//     headers,
//     body: JSON.stringify({
//       message: `Add ${title}`,
//       content: btoa(mdContent), // Base64 encode
//       branch: "main",
//     }),
//   });

//   // Commit Image
//   const imageBase64 = await fileToBase64(imageFile);

//   await fetch(`https://api.github.com/repos/${repo}/contents/src/content/paintings/${fileName}.jpg`, {
//     method: "PUT",
//     headers,
//     body: JSON.stringify({
//       message: `Add image for ${title}`,
//       content: imageBase64.split(",")[1], // Strip data URI prefix
//       branch: "main",
//     }),
//   });
// }

// // Convert image file to Base64
// function fileToBase64(file) {
//   return new Promise((resolve) => {
//     const reader = new FileReader();
//     reader.onload = () => resolve(reader.result);
//     reader.readAsDataURL(file);
//   });
// }
