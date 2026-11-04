"use client";
import { useApp } from "@/components/AppState";
import { Join } from "@/components/Join";
import { Uploader } from "@/components/Uploader";

export default function UploadPage() {
  const { me, loaded } = useApp();
  if (!loaded) return null;
  return me ? <Uploader /> : <Join />;
}
