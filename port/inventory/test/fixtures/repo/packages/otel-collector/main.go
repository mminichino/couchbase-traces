package main

import (
	"fmt"

	"github.com/ClickHouse/clickhouse-go/v2"
)

func main() {
	fmt.Println(clickhouse.ClientVersion)
}
