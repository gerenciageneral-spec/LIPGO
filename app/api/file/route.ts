import { type NextRequest, NextResponse } from "next/server"
import { head } from "@vercel/blob"

export async function GET(request: NextRequest) {
  try {
    const url = request.nextUrl.searchParams.get("url")

    if (!url) {
      return NextResponse.json({ error: "Missing url parameter" }, { status: 400 })
    }

    // Get blob metadata to verify it exists
    const blobInfo = await head(url)

    if (!blobInfo) {
      return new NextResponse("Not found", { status: 404 })
    }

    // Fetch the actual blob content
    const response = await fetch(blobInfo.url)
    
    if (!response.ok) {
      return new NextResponse("Failed to fetch file", { status: response.status })
    }

    const contentType = blobInfo.contentType || "application/octet-stream"
    const filename = blobInfo.pathname?.split("/").pop() || "file"

    return new NextResponse(response.body, {
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "private, no-cache",
        "Content-Disposition": `inline; filename="${filename}"`,
      },
    })
  } catch (error) {
    console.error("Error serving file:", error)
    return NextResponse.json({ error: "Failed to serve file" }, { status: 500 })
  }
}
