/** Typed client for the Pages Functions API. */

export interface ApiPainting {
  id: string;
  slug: string;
  title: string;
  price_cents: number;
  alt: string;
  description: string;
  image_key: string;
  image_url: string;
  status: "available" | "reserved" | "sold";
  width_in: number | null;
  height_in: number | null;
  depth_in: number | null;
  model_glb_url: string;
  model_usdz_url: string;
  created_at: string;
  updated_at: string;
}

export interface ApiInquiry {
  id: string;
  painting_id: string;
  buyer_name: string;
  buyer_email: string;
  message: string;
  status: "new" | "contacted" | "sold" | "closed";
  created_at: string;
  painting_title: string;
}

function adminHeaders(): HeadersInit {
  const token = sessionStorage.getItem("ADMIN_API_TOKEN") ?? "";
  return token === "" ? {} : { Authorization: `Bearer ${token}` };
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, init);
  const data = (await res.json()) as T & { error?: string };
  if (!res.ok) throw new Error(data.error ?? `Request failed (${res.status})`);
  return data;
}

export const api = {
  async listPaintings(): Promise<ApiPainting[]> {
    const data = await request<{ paintings: ApiPainting[] }>("/api/paintings");
    return data.paintings;
  },
  async createPainting(input: {
    title: string;
    priceCents: number;
    alt: string;
    description: string;
    imageKey: string;
    imageUrl: string;
    widthIn: number | null;
    heightIn: number | null;
    depthIn: number | null;
    modelGlbUrl: string;
    modelUsdzUrl: string;
  }): Promise<ApiPainting> {
    const data = await request<{ painting: ApiPainting }>("/api/paintings", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...adminHeaders() },
      body: JSON.stringify(input),
    });
    return data.painting;
  },
  async updatePainting(
    id: string,
    patch: Partial<Pick<ApiPainting, "title" | "status">> & { priceCents?: number },
  ): Promise<ApiPainting> {
    const data = await request<{ painting: ApiPainting }>(
      `/api/paintings/${encodeURIComponent(id)}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json", ...adminHeaders() },
        body: JSON.stringify(patch),
      },
    );
    return data.painting;
  },
  async deletePainting(id: string): Promise<void> {
    await request(`/api/paintings/${encodeURIComponent(id)}`, {
      method: "DELETE",
      headers: adminHeaders(),
    });
  },
  async uploadImage(blob: Blob): Promise<{ key: string; url: string }> {
    const form = new FormData();
    form.append("image", blob, "painting.jpg");
    const res = await fetch("/api/uploads", {
      method: "POST",
      headers: adminHeaders(),
      body: form,
    });
    const data = (await res.json()) as { key: string; url: string; error?: string };
    if (!res.ok) throw new Error(data.error ?? "Upload failed");
    return data;
  },
  async uploadModel(blob: Blob, filename: string): Promise<{ key: string; url: string }> {
    const form = new FormData();
    form.append("model", blob, filename);
    const res = await fetch("/api/models", {
      method: "POST",
      headers: adminHeaders(),
      body: form,
    });
    const data = (await res.json()) as { key: string; url: string; error?: string };
    if (!res.ok) throw new Error(data.error ?? "Model upload failed");
    return data;
  },
  async getAnnouncement(): Promise<string> {
    try {
      const data = await request<{ announcement: string }>("/api/settings");
      return data.announcement;
    } catch {
      return "";
    }
  },
  async setAnnouncement(announcement: string): Promise<void> {
    await request("/api/settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json", ...adminHeaders() },
      body: JSON.stringify({ announcement }),
    });
  },
  async paintingViews(): Promise<Array<{ slug: string; views: number }>> {
    const data = await request<{ views: Array<{ slug: string; views: number }> }>("/api/views", {
      headers: adminHeaders(),
    });
    return data.views;
  },
  async listInquiries(): Promise<ApiInquiry[]> {
    const data = await request<{ inquiries: ApiInquiry[] }>("/api/inquiries", {
      headers: adminHeaders(),
    });
    return data.inquiries;
  },
  async submitInquiry(input: {
    paintingId: string;
    name: string;
    email: string;
    message: string;
  }): Promise<void> {
    await request("/api/inquiries", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...input, website: "" }),
    });
  },
  async status(): Promise<{
    stripe: boolean;
    shippo: boolean;
    socialPost: boolean;
    email: boolean;
    push: boolean;
  }> {
    return await request("/api/status", { headers: adminHeaders() });
  },
  async autoPost(input: { text: string; imageUrl: string }): Promise<void> {
    await request("/api/social", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...adminHeaders() },
      body: JSON.stringify(input),
    });
  },
  async collectorCount(): Promise<number> {
    try {
      const data = await request<{ total: number }>("/api/notify", {
        headers: adminHeaders(),
      });
      return data.total;
    } catch {
      return 0;
    }
  },
  async notifyCollectors(): Promise<{ sent: number; total: number }> {
    const data = await request<{ sent: number; total: number }>("/api/notify", {
      method: "POST",
      headers: adminHeaders(),
    });
    return data;
  },
  async checkout(paintingId: string): Promise<string> {
    const data = await request<{ url: string }>("/api/checkout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ paintingId }),
    });
    return data.url;
  },
};
