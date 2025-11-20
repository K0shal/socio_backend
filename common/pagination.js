
const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 10;
const MAX_LIMIT = 100;


const parsePaginationParams = (query = {}) => {
  let page = parseInt(query.page, 10) || DEFAULT_PAGE;
  let limit = parseInt(query.limit, 10) || DEFAULT_LIMIT;

  page = Math.max(1, page);
  limit = Math.max(1, Math.min(MAX_LIMIT, limit));

  const skip = (page - 1) * limit;

  return {
    page,
    limit,
    skip
  };
};


const calculatePagination = (page, limit, totalItems) => {
  const totalPages = Math.ceil(totalItems / limit);
  const hasNextPage = page < totalPages;
  const hasPrevPage = page > 1;

  return {
    currentPage: page,
    itemsPerPage: limit,
    totalItems,
    totalPages,
    hasNextPage,
    hasPrevPage,
    nextPage: hasNextPage ? page + 1 : null,
    prevPage: hasPrevPage ? page - 1 : null
  };
};

const createPaginatedResponse = (data, pagination, additionalData = {}) => {
  return {
    ...additionalData,
    pagination,
    data
  };
};


const buildPaginationPipeline = (matchQuery = {}, sortQuery = {}, paginationParams) => {
  const { skip, limit } = paginationParams;
  
  const pipeline = [
    { $match: matchQuery }
  ];

  if (Object.keys(sortQuery).length > 0) {
    pipeline.push({ $sort: sortQuery });
  }

  pipeline.push(
    {
      $facet: {
        data: [
          { $skip: skip },
          { $limit: limit }
        ],
        count: [
          { $count: "total" }
        ]
      }
    }
  );

  return pipeline;
};


const processPaginationResults = (results, paginationParams) => {
  const [{ data, count }] = results;
  const totalItems = count.length > 0 ? count[0].total : 0;
  const pagination = calculatePagination(
    paginationParams.page,
    paginationParams.limit,
    totalItems
  );

  return {
    data,
    pagination,
    totalItems
  };
};


const paginate = async (query, paginationParams, sortQuery = {}) => {
  const { skip, limit, page } = paginationParams;
  
  // Create a fresh query for counting to avoid "already executed" error
  const countQuery = query.model.find();
  if (query.getQuery()) {
    countQuery.where(query.getQuery());
  }
  
  const [data, totalItems] = await Promise.all([
    query.skip(skip).limit(limit).exec(),
    countQuery.countDocuments().exec()
  ]);

  const pagination = calculatePagination(page, limit, totalItems);

  return {
    data,
    pagination,
    totalItems
  };
};


const generatePaginationLinks = (baseUrl, pagination, queryParams = {}) => {
  const { currentPage, hasNextPage, hasPrevPage, nextPage, prevPage, totalPages } = pagination;
  
  const buildUrl = (page) => {
    const params = new URLSearchParams({
      ...queryParams,
      page: page.toString()
    });
    return `${baseUrl}?${params.toString()}`;
  };

  const links = {
    self: buildUrl(currentPage),
    first: buildUrl(1),
    last: buildUrl(totalPages)
  };

  if (hasNextPage) {
    links.next = buildUrl(nextPage);
  }

  if (hasPrevPage) {
    links.prev = buildUrl(prevPage);
  }

  return links;
};

module.exports = {
  DEFAULT_PAGE,
  DEFAULT_LIMIT,
  MAX_LIMIT,
  parsePaginationParams,
  calculatePagination,
  createPaginatedResponse,
  buildPaginationPipeline,
  processPaginationResults,
  paginate,
  generatePaginationLinks
};
