import type { Metadata } from "next";

import { SiteMasthead } from "@/components/site-masthead";

import { UploadClient } from "./upload-client";

export const metadata: Metadata = {
  title: "Floor plan analysis · Fengshui AI",
  description:
    "Upload your floor plan for a unit-level fengshui reading — form school, flying stars (Period 9), and eight mansions.",
};

export default function UploadPage() {
  return (
    <>
      <SiteMasthead />
      <UploadClient />
    </>
  );
}
