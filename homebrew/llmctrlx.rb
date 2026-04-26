class Llmctrlx < Formula
  desc "LLM Control Engine - A modular LLM control engine with dynamic tool loading"
  homepage "https://github.com/davidcrumpton/llm-control-engine"
  url "https://registry.npmjs.org/llmctrlx/-/llmctrlx-#{version}.tgz"
  sha256 "..."
  license "Apache-2.0"

  depends_on "node"

  def install
    system "npm", "install", "--production", "--ignore-scripts"
    bin.install "llmctrlx.js" => "llmctrlx"
  end

  test do
    assert_match "llmctrlx", shell_output("#{bin}/llmctrlx version")
  end
end