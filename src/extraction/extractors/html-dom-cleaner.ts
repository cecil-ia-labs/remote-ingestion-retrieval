const DEFAULT_REMOVE_SELECTORS =
  [
    "script",
    "style",
    "noscript",
    "template",
    "nav",
    "footer",
    "form",
    "button",
    'input:not([type="checkbox"])',
    "select",
    "textarea",
    "iframe",
    "object",
    "embed",
    "canvas",
    "svg",
    "dialog",
    "[hidden]",
    '[aria-hidden="true"]',

    // Common non-content UI.
    ".cookie-banner",
    ".cookie-consent",
    ".cookie-notice",
    "#cookie-banner",
    "#cookie-consent",
    "#cookie-notice",

    ".modal",
    ".popup",
    ".popover",

    ".advertisement",
    ".advert",
    ".ads",
    ".ad-container",

    ".social-share",
    ".share-buttons",

    ".breadcrumb",
    ".breadcrumbs",
  ] as const;

const URL_ATTRIBUTES =
  [
    "href",
    "src",
    "poster",
    "cite",
  ] as const;

function isUnsafeUrl(
  value: string,
): boolean {
  const trimmed =
    value.trim();

  return (
    /^javascript:/i.test(trimmed)
    || /^vbscript:/i.test(trimmed)
  );
}

function absolutizeUrl(
  value: string,
  baseUrl: string,
): string {
  const trimmed =
    value.trim();

  if (
    trimmed.length === 0
    || trimmed.startsWith("#")
    || trimmed.startsWith("data:")
    || trimmed.startsWith("mailto:")
    || trimmed.startsWith("tel:")
  ) {
    return trimmed;
  }

  try {
    return new URL(
      trimmed,
      baseUrl,
    ).toString();
  } catch {
    return trimmed;
  }
}

function cleanAttributes(
  element: Element,
  baseUrl: string,
  absolutizeUrls: boolean,
): void {
  for (
    const attribute
    of Array.from(
      element.attributes,
    )
  ) {
    const name =
      attribute.name
        .toLowerCase();

    if (
      name.startsWith("on")
      || name === "srcdoc"
    ) {
      element.removeAttribute(
        attribute.name,
      );

      continue;
    }

    if (
      URL_ATTRIBUTES.includes(
        name as typeof URL_ATTRIBUTES[number],
      )
    ) {
      if (
        isUnsafeUrl(
          attribute.value,
        )
      ) {
        element.removeAttribute(
          attribute.name,
        );

        continue;
      }

      if (absolutizeUrls) {
        element.setAttribute(
          attribute.name,
          absolutizeUrl(
            attribute.value,
            baseUrl,
          ),
        );
      }
    }
  }

  const srcset =
    element.getAttribute(
      "srcset",
    );

  if (srcset) {
    const normalized =
      srcset
        .split(",")
        .map(
          (candidate) => {
            const [
              rawUrl,
              ...descriptor
            ] =
              candidate
                .trim()
                .split(/\s+/);

            if (
              !rawUrl
              || isUnsafeUrl(
                rawUrl,
              )
            ) {
              return "";
            }

            const url =
              absolutizeUrls
                ? absolutizeUrl(
                    rawUrl,
                    baseUrl,
                  )
                : rawUrl;

            return [
              url,
              ...descriptor,
            ]
              .filter(Boolean)
              .join(" ");
          },
        )
        .filter(Boolean)
        .join(", ");

    if (normalized) {
      element.setAttribute(
        "srcset",
        normalized,
      );
    } else {
      element.removeAttribute(
        "srcset",
      );
    }
  }
}

export interface CleanHtmlSubtreeOptions {
  baseUrl: string;

  removeSelectors?:
    readonly string[];

  absolutizeUrls?: boolean;
}

export function cleanHtmlSubtree(
  root: Element,
  options: CleanHtmlSubtreeOptions,
): Element {
  const clone =
    root.cloneNode(
      true,
    ) as Element;

  const selectors = [
    ...DEFAULT_REMOVE_SELECTORS,
    ...(options.removeSelectors
      ?? []),
  ];

  for (
    const selector
    of selectors
  ) {
    try {
      for (
        const element
        of Array.from(
          clone.querySelectorAll(
            selector,
          ),
        )
      ) {
        element.remove();
      }
    } catch {
      // Invalid user-provided selectors should not make HTML extraction fail.
      // Validation can be introduced at the public configuration boundary.
    }
  }

  /**
   * Preserve only checkbox inputs that carry semantic task-list state.
   * All other inputs were already removed by the default selector above.
   */
  for (
    const checkbox
    of Array.from(
      clone.querySelectorAll(
        'input[type="checkbox"]',
      ),
    )
  ) {
    if (
      !checkbox.closest(
        "li",
      )
    ) {
      checkbox.remove();
    }
  }

  cleanAttributes(
    clone,
    options.baseUrl,
    options.absolutizeUrls
      ?? true,
  );

  for (
    const element
    of Array.from(
      clone.querySelectorAll("*"),
    )
  ) {
    cleanAttributes(
      element,
      options.baseUrl,
      options.absolutizeUrls
        ?? true,
    );
  }

  return clone;
}

export function normalizedTextLength(
  element: Element,
): number {
  return (
    element.textContent
      ?.replace(
        /\s+/g,
        " ",
      )
      .trim()
      .length
    ?? 0
  );
}
