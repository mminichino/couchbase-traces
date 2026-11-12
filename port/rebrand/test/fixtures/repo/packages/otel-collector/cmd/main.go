package main

import (
	"os"

	"github.com/ClickHouse/ClickStack/packages/otel-collector/internal/x"
)

func main() {
	_ = os.Getenv("HYPERDX_Z")
	x.Run()
}
