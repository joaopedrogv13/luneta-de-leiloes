// A mesma imagem de compartilhamento da home. Sem este arquivo, /assinante ficava sem og:image e
// twitter:image, porque o `openGraph` da página substitui o do layout inteiro (merge raso).
export { default, alt, size, contentType } from "../opengraph-image";
