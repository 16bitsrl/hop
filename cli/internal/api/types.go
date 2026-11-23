package api

import "time"

// User is the person behind the key.
type User struct {
	ID              string  `json:"id"`
	Name            string  `json:"name"`
	Email           string  `json:"email"`
	Role            string  `json:"role"`
	Locale          *string `json:"locale"`
	DefaultDomainID *string `json:"defaultDomainId"`
}

// Tag labels links.
type Tag struct {
	ID        string  `json:"id"`
	Name      string  `json:"name"`
	Color     *string `json:"color"`
	LinkCount int     `json:"linkCount"`
}

// Folder groups links; folders can be nested.
type Folder struct {
	ID        string  `json:"id"`
	Name      string  `json:"name"`
	ParentID  *string `json:"parentId"`
	LinkCount int     `json:"linkCount"`
	CanModify bool    `json:"canModify"`
}

// Domain is a short domain.
type Domain struct {
	ID          string  `json:"id"`
	Host        string  `json:"host"`
	IsDefault   bool    `json:"isDefault"`
	RootURL     *string `json:"rootUrl"`
	NotFoundURL *string `json:"notFoundUrl"`
	LinkCount   int     `json:"linkCount"`
}

// Rule sends some visitors (by device, country, language) to another destination.
type Rule struct {
	ID        string   `json:"id,omitempty"`
	Devices   []string `json:"devices,omitempty"`
	Countries []string `json:"countries,omitempty"`
	Languages []string `json:"languages,omitempty"`
	URL       string   `json:"url"`
	AppURL    string   `json:"appUrl,omitempty"`
}

// Variant is one destination of an A/B test.
type Variant struct {
	ID     string `json:"id,omitempty"`
	URL    string `json:"url"`
	Weight int    `json:"weight"`
}

// Link is a short link as the server describes it.
type Link struct {
	ID              string     `json:"id"`
	DomainID        string     `json:"domainId"`
	Host            string     `json:"host"`
	ShortURL        string     `json:"shortUrl"`
	Slug            string     `json:"slug"`
	URL             string     `json:"url"`
	Title           *string    `json:"title"`
	Notes           *string    `json:"notes"`
	OwnerID         *string    `json:"ownerId"`
	OwnerName       *string    `json:"ownerName"`
	FolderID        *string    `json:"folderId"`
	Tags            []Tag      `json:"tags"`
	RedirectType    int        `json:"redirectType"`
	ForwardQuery    bool       `json:"forwardQuery"`
	Enabled         bool       `json:"enabled"`
	HasPassword     bool       `json:"hasPassword"`
	ExpiresAt       *time.Time `json:"expiresAt"`
	MaxClicks       *int       `json:"maxClicks"`
	FallbackURL     *string    `json:"fallbackUrl"`
	Rules           []Rule     `json:"rules"`
	Variants        []Variant  `json:"variants"`
	AppURL          *string    `json:"appUrl"`
	OgTitle         *string    `json:"ogTitle"`
	OgDescription   *string    `json:"ogDescription"`
	OgImage         *string    `json:"ogImage"`
	PublicStats     bool       `json:"publicStats"`
	ClickCount      int        `json:"clickCount"`
	LastClickedAt   *time.Time `json:"lastClickedAt"`
	HealthStatus    string     `json:"healthStatus"`
	HealthCode      *int       `json:"healthCode"`
	HealthCheckedAt *time.Time `json:"healthCheckedAt"`
	States          []string   `json:"states"`
	CreatedAt       time.Time  `json:"createdAt"`
	UpdatedAt       time.Time  `json:"updatedAt"`
	CanModify       bool       `json:"canModify"`
}

// LinkPage is one page of the links list.
type LinkPage struct {
	Items    []Link `json:"items"`
	Total    int    `json:"total"`
	Page     int    `json:"page"`
	PageSize int    `json:"pageSize"`
}

// Count is one row of a breakdown; a nil key means "unknown" or "direct".
type Count struct {
	Key     *string `json:"key"`
	Country *string `json:"country,omitempty"`
	Clicks  int     `json:"clicks"`
}

// Target is how many visitors one destination of a link received.
type Target struct {
	Target   string  `json:"target"`
	Kind     string  `json:"kind"`
	URL      *string `json:"url"`
	Current  bool    `json:"current"`
	Clicks   int     `json:"clicks"`
	Visitors int     `json:"visitors"`
}

// TopLink is a row of the most clicked links.
type TopLink struct {
	ID     string  `json:"id"`
	Slug   string  `json:"slug"`
	Title  *string `json:"title"`
	Host   string  `json:"host"`
	Clicks int     `json:"clicks"`
}

// Stats is the statistics of one link or of the whole installation.
type Stats struct {
	Range struct {
		From   int64  `json:"from"`
		To     int64  `json:"to"`
		Tz     string `json:"tz"`
		Bucket string `json:"bucket"`
	} `json:"range"`
	Totals struct {
		Clicks   int `json:"clicks"`
		Visitors int `json:"visitors"`
		Bots     int `json:"bots"`
	} `json:"totals"`
	Series []struct {
		Key    string `json:"key"`
		Clicks int    `json:"clicks"`
	} `json:"series"`
	Referrers []Count   `json:"referrers"`
	Countries []Count   `json:"countries"`
	Cities    []Count   `json:"cities"`
	Devices   []Count   `json:"devices"`
	OS        []Count   `json:"os"`
	Browsers  []Count   `json:"browsers"`
	Languages []Count   `json:"languages"`
	Targets   []Target  `json:"targets"`
	TopLinks  []TopLink `json:"topLinks"`
	LinkCount int       `json:"linkCount"`
}

// HistoryItem is one change of a link, or one line of the activity log.
type HistoryItem struct {
	ID         any            `json:"id"`
	Ts         time.Time      `json:"ts"`
	UserName   *string        `json:"userName"`
	Action     string         `json:"action"`
	EntityType string         `json:"entityType"`
	EntityID   *string        `json:"entityId"`
	Data       map[string]any `json:"data"`
}
